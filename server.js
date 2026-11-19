require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Раздаем статические файлы (HTML, CSS, JS) из этой же папки
app.use(express.static(__dirname));

const TOKEN = process.env.CRYPTO_PAY_TOKEN;
const API_URL = "https://pay.crypt.bot/api/";

async function callCryptoBot(method, params) {
  const response = await fetch(API_URL + method, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": TOKEN
    },
    body: JSON.stringify(params)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error ? data.error.message : "Ошибка API");
  return data.result;
}

app.post("/api/create-invoice", async (req, res) => {
  try {
    const { amount, userId } = req.body;
    if (!amount || !userId) return res.status(400).json({ error: "Не хватает данных" });

    const result = await callCryptoBot("createInvoice", {
      amount: String(amount),
      asset: "USDT",
      description: "Пополнение RPОбзвон. ID: " + userId,
      payload: "user_" + userId + "_" + Date.now(),
      allow_comments: false,
      allow_anonymous: false,
      expires_in: 1800
    });

    res.json({
      ok: true,
      invoice_id: result.invoice_id,
      pay_url: result.bot_invoice_url || result.mini_app_invoice_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/check-payment", async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const result = await callCryptoBot("getInvoices", { invoice_ids: String(invoiceId) });
    
    if (!result.items || result.items.length === 0) {
      return res.status(404).json({ error: "Счет не найден" });
    }

    const status = result.items[0].status;
    res.json({ ok: true, status: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен. Открой в браузере: http://localhost:${PORT}`);
});