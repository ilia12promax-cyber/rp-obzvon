const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ВСТАВЬ СЮДА СВОЙ INTERNAL DATABASE URL ИЗ RENDER
const dbUrl = "ВСТАВЬ_СЮДА_ТВОЙ_INTERNAL_DATABASE_URL";
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN;
const API_URL = "https://pay.crypt.bot/api/";

// ================= ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ =================
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        login VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nick VARCHAR(50) NOT NULL,
        level INTEGER DEFAULT 0,
        balance DECIMAL(10, 2) DEFAULT 0.00,
        avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        telegram VARCHAR(100),
        project_name VARCHAR(100),
        position_name VARCHAR(100),
        extras TEXT,
        total DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'pending',
        assigned_to INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS prices (
        key VARCHAR(50) PRIMARY KEY,
        category VARCHAR(20),
        name VARCHAR(100),
        price DECIMAL(10, 2)
      );
    `);

    const pricesCheck = await pool.query('SELECT COUNT(*) FROM prices');
    if (parseInt(pricesCheck.rows[0].count) === 0) {
      const defaultPrices = [
        ['black_russia', 'project', 'Black Russia', 4.5],
        ['grand_mobile', 'project', 'Grand Mobile', 5.0],
        ['matreshka_rp', 'project', 'Matreshka RP', 4.0],
        ['arizona_rp', 'project', 'Arizona RP', 5.5],
        ['other', 'project', 'Другой проект', 6.0],
        ['leader_gov', 'position', 'Лидер организации (ГОСС)', 9.0],
        ['leader_opg', 'position', 'Лидер организации (ОПГ)', 10.0],
        ['deputy', 'position', 'Заместитель лидера (9 ранг)', 7.0],
        ['senior', 'position', 'Старший состав (7–8 ранг)', 5.5],
        ['support', 'position', 'Агент поддержки / Хелпер', 4.0],
        ['junior_admin', 'position', 'Младший администратор / Модератор', 6.5],
        ['cheat_sheet', 'extra', 'Индивидуальная шпаргалка с ответами', 2.5],
        ['trial_call', 'extra', 'Пробный тестовый обзвон', 2.0],
        ['urgent', 'extra', 'Срочный заказ (15–30 минут)', 3.5]
      ];
      for (let p of defaultPrices) {
        await pool.query('INSERT INTO prices (key, category, name, price) VALUES ($1, $2, $3, $4)', p);
      }
    }

    const ownerCheck = await pool.query('SELECT * FROM users WHERE level = 10');
    if (ownerCheck.rows.length === 0) {
      const hash = await bcrypt.hash('owner10', 10);
      await pool.query(
        'INSERT INTO users (login, password_hash, nick, level, balance) VALUES ($1, $2, $3, $4, $5)',
        ['owner', hash, 'Owner', 10, 1000.00]
      );
    }
    console.log("База данных инициализирована.");
  } catch (err) {
    console.error("Ошибка инициализации БД:", err);
  }
}
initDb();

// ================= API =================
app.post("/api/register", async (req, res) => {
  try {
    const { login, password, nick } = req.body;
    if (!login || !password || !nick) return res.status(400).json({ error: "Заполните все поля" });
    
    const existing = await pool.query('SELECT id FROM users WHERE login = $1', [login]);
    if (existing.rows.length > 0) return res.status(400).json({ error: "Логин уже занят" });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (login, password_hash, nick) VALUES ($1, $2, $3) RETURNING id, login, nick, level, balance, avatar',
      [login, hash, nick]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { login, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE login = $1', [login]);
    if (result.rows.length === 0) return res.status(400).json({ error: "Пользователь не найден" });
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: "Неверный пароль" });

    res.json({ ok: true, user: { id: user.id, login: user.login, nick: user.nick, level: user.level, balance: user.balance, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/update-profile", async (req, res) => {
  try {
    const { userId, nick, avatar, newLogin, newPassword } = req.body;
    let query = 'UPDATE users SET nick = $1, avatar = $2';
    let params = [nick, avatar];
    let paramCount = 3;

    if (newLogin) { query += `, login = $${paramCount}`; params.push(newLogin); paramCount++; }
    if (newPassword) { 
      const hash = await bcrypt.hash(newPassword, 10);
      query += `, password_hash = $${paramCount}`; 
      params.push(hash); 
      paramCount++; 
    }
    query += ` WHERE id = $${paramCount} RETURNING id, login, nick, level, balance, avatar`;
    params.push(userId);

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: "Пользователь не найден" });
    
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "Этот логин уже занят" });
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prices", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prices');
    const prices = { projects: {}, positions: {}, extras: {} };
    result.rows.forEach(row => {
      const cat = row.category === 'project' ? 'projects' : row.category === 'position' ? 'positions' : 'extras';
      prices[cat][row.key] = { name: row.name, price: parseFloat(row.price) };
    });
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prices", async (req, res) => {
  try {
    const { prices } = req.body;
    for (let cat in prices) {
      const category = cat === 'projects' ? 'project' : cat === 'positions' ? 'position' : 'extra';
      for (let key in prices[cat]) {
        await pool.query(
          'UPDATE prices SET price = $1 WHERE key = $2 AND category = $3',
          [prices[cat][key].price, key, category]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const { userId, telegram, projectName, positionName, extras, total } = req.body;
    const userRes = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Пользователь не найден" });
    if (parseFloat(userRes.rows[0].balance) < total) return res.status(400).json({ error: "Недостаточно средств" });

    const extrasStr = JSON.stringify(extras);
    const orderRes = await pool.query(
      `INSERT INTO orders (user_id, telegram, project_name, position_name, extras, total) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, telegram, projectName, positionName, extrasStr, total]
    );

    await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [total, userId]);
    res.json({ ok: true, orderId: orderRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const isAdmin = req.query.isAdmin === 'true';
    let query, params;

    if (isAdmin) {
      query = `SELECT o.*, u.nick as user_nick, a.nick as assigned_nick 
               FROM orders o JOIN users u ON o.user_id = u.id 
               LEFT JOIN users a ON o.assigned_to = a.id 
               ORDER BY o.created_at DESC`;
      params = [];
    } else {
      query = `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders/claim", async (req, res) => {
  try {
    const { orderId, adminId } = req.body;
    const result = await pool.query(
      `UPDATE orders SET status = 'in_progress', assigned_to = $1 WHERE id = $2 AND status = 'pending' RETURNING id`,
      [adminId, orderId]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "Заказ уже взят в работу" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders/complete", async (req, res) => {
  try {
    const { orderId, adminId } = req.body;
    const result = await pool.query(
      `UPDATE orders SET status = 'done', completed_at = NOW() WHERE id = $1 AND assigned_to = $2 RETURNING id`,
      [orderId, adminId]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "Ошибка завершения" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query('SELECT id, login, nick, level, balance FROM users ORDER BY level DESC, id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users/level", async (req, res) => {
  try {
    const { userId, level } = req.body;
    await pool.query('UPDATE users SET level = $1 WHERE id = $2', [level, userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function callCryptoBot(method, params) {
  const response = await fetch(API_URL + method, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN },
    body: JSON.stringify(params)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error ? data.error.message : "Ошибка API");
  return data.result;
}

app.post("/api/create-invoice", async (req, res) => {
  try {
    const { amount, userId } = req.body;
    const result = await callCryptoBot("createInvoice", {
      amount: String(amount), asset: "USDT", description: "Пополнение ID: " + userId,
      payload: "user_" + userId + "_" + Date.now(), allow_comments: false, allow_anonymous: false, expires_in: 1800
    });
    res.json({ ok: true, invoice_id: result.invoice_id, pay_url: result.bot_invoice_url || result.mini_app_invoice_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/check-payment", async (req, res) => {
  try {
    const { invoiceId, userId } = req.body;
    const result = await callCryptoBot("getInvoices", { invoice_ids: String(invoiceId) });
    if (!result.items || result.items.length === 0) return res.status(404).json({ error: "Счет не найден" });
    
    if (result.items[0].status === "paid") {
      const amount = parseFloat(result.items[0].amount);
      await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);
      res.json({ ok: true, status: "paid", amount: amount });
    } else {
      res.json({ ok: true, status: result.items[0].status });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
