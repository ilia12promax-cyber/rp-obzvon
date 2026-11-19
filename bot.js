require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("Ошибка: не указан BOT_TOKEN в переменных окружения");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

console.log("Бот запущен и слушает сообщения...");

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const payload = match[1];
  const nick = msg.from.first_name || msg.from.username || "друг";

  if (!payload || !payload.startsWith("pay_")) {
    return bot.sendMessage(chatId, `Привет, ${nick}!\n\nЧтобы пополнить баланс на сайте, нажми на кнопку «Пополнить» на самом сайте и выбери «Telegram Stars».`);
  }

  const parts = payload.split("_");
  const siteUserId = parts[1];

  if (!siteUserId) {
    return bot.sendMessage(chatId, "Ошибка: неверная ссылка для оплаты.");
  }

  const prices = [
    { label: '10 USDT', amount: 10 },
    { label: '25 USDT', amount: 25 },
    { label: '50 USDT', amount: 50 },
    { label: '100 USDT', amount: 100 }
  ];

  const keyboard = {
    inline_keyboard: prices.map(p => [{
      text: `${p.label} (${p.amount} Stars)`,
      callback_data: `pay_${siteUserId}_${p.amount}`
    }])
  };

  bot.sendMessage(chatId, "Выберите сумму для пополнения (курс: 1 USDT = 50 Stars):", {
    reply_markup: keyboard
  });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!data.startsWith("pay_")) return;

  const parts = data.split("_");
  const siteUserId = parts[1];
  const amount = parseInt(parts[2], 10);

  // Стоимость в Stars (1 USDT = 50 Stars)
  const starsAmount = amount * 50;

  // В Telegram Stars валюта XTR (без копеек, целое число)
  const title = `Пополнение баланса на ${amount} USDT`;
  const description = `Зачисление ${amount} USDT на ваш аккаунт RPОбзвон.`;
  const payload = `site_${siteUserId}_${amount}_${Date.now()}`;

  try {
    await bot.sendInvoice(
      chatId,
      title,
      description,
      payload,
      "XTR", // Валюта Telegram Stars
      [{
        label: `${amount} USDT`,
        amount: starsAmount // Сумма в Stars
      }],
      {
        provider_token: "", // Для Stars это поле должно быть пустым
        currency: "XTR",
        // Важно: убираем disabled из аргументов
      }
    );
    bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("Ошибка создания счета:", err.message);
    bot.sendMessage(chatId, "Не удалось создать счет. Попробуйте позже.");
  }
});

bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;
  const payload = payment.invoice_payload;
  const totalStars = payment.total_amount; // Сумма в Stars

  const parts = payload.split("_");
  const siteUserId = parts[1];
  const amountUsdt = parts[2]; // Целое число, которое мы закладывали (10, 25, 50, 100)

  try {
    // Отправляем запрос на сервер для пополнения баланса в БД
    const res = await fetch(`${SERVER_URL}/api/bot-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: siteUserId,
        amount: amountUsdt,
        stars: totalStars
      })
    });

    const data = await res.json();
    if (data.ok) {
      bot.sendMessage(chatId, `✅ Оплата прошла успешно!\n\nБаланс на сайте пополнен на ${amountUsdt} USDT.\nСумма Stars: ${totalStars}`);
    } else {
      bot.sendMessage(chatId, `❌ Ошибка зачисления. Обратитесь в поддержку.`);
    }
  } catch (err) {
    console.error("Ошибка зачисления:", err);
    bot.sendMessage(chatId, "❌ Ошибка сервера. Обратитесь в поддержку.");
  }
});

console.log("Бот готов к приему платежей.");
