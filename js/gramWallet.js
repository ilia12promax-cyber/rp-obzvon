(function () {
  "use strict";

  // Теперь мы стучимся на наш локальный сервер, а не напрямую в CryptoBot
  var API_URL = "/api";
  var pendingInvoices = {};

  function sanitizeAmount(amount) {
    var n = parseFloat(String(amount).replace(",", "."));
    if (isNaN(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function createInvoice(userId, amount, network) {
    var cleanAmount = sanitizeAmount(amount);
    if (cleanAmount === null || cleanAmount < 1) {
      return Promise.resolve({ ok: false, error: "Введите сумму от 1 USDT" });
    }
    if (!userId) return Promise.resolve({ ok: false, error: "Сначала войдите в аккаунт" });

    return fetch(API_URL + "/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: cleanAmount, userId: userId })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      
      var invoice = {
        invoiceId: data.invoice_id,
        userId: String(userId),
        amount: cleanAmount,
        payUrl: data.pay_url,
        status: "pending"
      };
      pendingInvoices[data.invoice_id] = invoice;
      return { ok: true, invoice: invoice };
    })
    .catch(function(err) {
      return { ok: false, error: err.message };
    });
  }

  function checkPayment(invoiceId) {
    var invoice = pendingInvoices[invoiceId];
    if (!invoice) return Promise.resolve({ ok: false, error: "Инвойс не найден" });

    return fetch(API_URL + "/check-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoiceId })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      
      if (data.status === "paid") {
        if (invoice.status !== "paid") {
          invoice.status = "paid";
          window.AppStorage.changeBalance(invoice.userId, invoice.amount);
          var user = window.AppStorage.getUserById(invoice.userId);
          return { ok: true, amount: invoice.amount, newBalance: user.balance };
        }
        return { ok: true, already: true };
      }
      return { ok: false, error: "Оплата еще не поступила. Статус: " + data.status };
    })
    .catch(function(err) {
      return { ok: false, error: err.message };
    });
  }

  window.GramWalletAPI = {
    MIN_AMOUNT: 1,
    createInvoice: createInvoice,
    getInvoice: function(id) { return pendingInvoices[id] || null; },
    checkPayment: checkPayment,
    simulateInstantPay: function() { return { ok: false, error: "Отключено" }; }
  };
})();