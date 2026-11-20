(function () {
  "use strict";

  var S = window.AppStorage;
  var G = window.GramWalletAPI;

  if (!S || !G) return;

  var state = {
    currentUser: null,
    obzvon: { projectKey: null, positionKey: null, extras: {}, telegram: "" },
    topup: { invoice: null }
  };

  function q(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function money(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2) + " USDT";
  }

  window.showToast = function (msg, type) {
    var existing = document.querySelector(".toast");
    if (existing) existing.remove();
    var div = document.createElement("div");
    div.className = "toast toast-" + (type || "success");
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.remove(); }, 5000);
  };

  function initials(nick) {
    if (!nick) return "?";
    var parts = String(nick).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return String(nick).substring(0, 2).toUpperCase();
  }

  function avatarHTML(user, size) {
    var px = size || 32;
    var style = "width:" + px + "px;height:" + px + "px;";
    if (user && user.avatar) return '<span class="header-avatar" style="' + style + '"><img src="' + user.avatar + '" alt=""></span>';
    return '<span class="header-avatar" style="' + style + '">' + esc(initials(user && user.nick)) + "</span>";
  }

  function drawAvatarCanvas(user) {
    var canvas = q("avatarCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (user && user.avatar) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, w, h); };
      img.src = user.avatar;
      return;
    }

    ctx.fillStyle = "#3A86FF";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold " + Math.floor(w * 0.36) + "px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(user && user.nick), w / 2, h / 2 + 2);
  }

  function openModal(id) {
    var el = q(id);
    if (el) { el.hidden = false; document.body.style.overflow = "hidden"; }
  }

  function closeModal(id) {
    var el = q(id);
    if (el) { el.hidden = true; document.body.style.overflow = ""; }
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach(function (m) { m.hidden = true; });
    document.body.style.overflow = "";
  }

  function ensureModal(id, innerHTML) {
    var el = q(id);
    if (el) return el;
    var wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = id;
    wrap.hidden = true;
    wrap.innerHTML = innerHTML;
    document.body.appendChild(wrap);
    return wrap;
  }

  function buildAuthModal() {
    ensureModal(
      "authModal",
      '<div class="modal">' +
        '<div class="modal-head">' +
          "<h3>Вход в аккаунт</h3>" +
          '<button class="modal-close" type="button" data-close-modal="authModal">×</button>' +
        "</div>" +
        '<div class="modal-body">' +
          '<div class="modal-tabs">' +
            '<button class="modal-tab active" type="button" data-auth-tab="login">Вход</button>' +
            '<button class="modal-tab" type="button" data-auth-tab="register">Регистрация</button>' +
          "</div>" +
          '<form id="loginForm" class="auth-form">' +
            '<div class="field"><label>Логин</label><input class="input" id="loginLogin"></div>' +
            '<div class="field"><label>Пароль</label><input class="input" id="loginPassword" type="password"></div>' +
            '<div class="form-error" id="loginError" hidden></div>' +
            '<div class="modal-actions"><button class="btn btn-primary btn-block" type="submit">Войти</button></div>' +
          "</form>" +
          '<form id="registerForm" class="auth-form" hidden>' +
            '<div class="field"><label>Логин</label><input class="input" id="regLogin"></div>' +
            '<div class="field"><label>Ник</label><input class="input" id="regNick" maxlength="24"></div>' +
            '<div class="field"><label>Пароль</label><input class="input" id="regPassword" type="password"></div>' +
            '<div class="form-error" id="registerError" hidden></div>' +
            '<div class="modal-actions"><button class="btn btn-primary btn-block" type="submit">Создать аккаунт</button></div>' +
          "</form>" +
        "</div>" +
      "</div>"
    );
  }

  function buildTopupModal() {
    ensureModal(
      "topupModal",
      '<div class="modal">' +
        '<div class="modal-head">' +
          "<h3>Пополнение баланса</h3>" +
          '<button class="modal-close" type="button" data-close-modal="topupModal">×</button>' +
        "</div>" +
        '<div class="modal-body">' +
          '<div id="topupStep1">' +
            '<div class="field"><label>Сумма, USDT</label><input class="input" id="topupAmount" type="number" min="1" step="0.5" value="10"></div>' +
            '<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">' +
              '<button class="btn btn-primary btn-block" id="createInvoiceBtn" type="button">Оплатить через CryptoBot (USDT)</button>' +
              '<button class="btn btn-outline btn-block" id="payStarsBtn" type="button">Оплатить Telegram Stars</button>' +
            '</div>' +
            '<div class="form-error" id="topupError" hidden style="margin-top: 10px;"></div>' +
          "</div>" +
          '<div id="topupStep2" hidden>' +
            '<div class="invoice-box" id="invoiceBox"></div>' +
            '<div class="form-error" id="checkError" hidden></div>' +
            '<div class="form-success" id="checkSuccess" hidden></div>' +
            '<div class="modal-actions">' +
              '<button class="btn btn-primary btn-block" id="checkPaymentBtn" type="button">Проверить оплату</button>' +
              '<button class="btn btn-ghost btn-block" id="backToTopupBtn" type="button">Изменить сумму</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderHeader() {
    var headerRight = q("headerRight");
    if (!headerRight) return;

    var user = state.currentUser;
    var navAdmin = q("navAdmin");
    if (navAdmin) navAdmin.hidden = !(user && user.level >= 1);

    headerRight.innerHTML = "";

    if (!user) {
      var loginBtn = document.createElement("button");
      loginBtn.className = "btn btn-primary btn-sm";
      loginBtn.textContent = "Войти";
      loginBtn.onclick = function () { openModal("authModal"); };
      headerRight.appendChild(loginBtn);
      return;
    }

    var balance = document.createElement("span");
    balance.className = "balance-pill";
    balance.textContent = money(user.balance);

    var topup = document.createElement("button");
    topup.className = "btn btn-primary btn-sm";
    topup.textContent = "Пополнить";
    topup.onclick = function () {
      state.topup.invoice = null;
      q("topupStep1").hidden = false;
      q("topupStep2").hidden = true;
      openModal("topupModal");
    };

    var userLink = document.createElement("a");
    userLink.href = "profile.html";
    userLink.className = "header-user";
    userLink.innerHTML = avatarHTML(user, 32) + '<span class="header-nick">' + esc(user.nick) + "</span>";

    headerRight.appendChild(balance);
    headerRight.appendChild(topup);
    headerRight.appendChild(userLink);
  }

  async function fetchUserData() {
    var id = S.getCurrentUserId();
    if (!id) { state.currentUser = null; return; }
    
    try {
      var users = await S.getUsers();
      var me = users.find(u => String(u.id) === String(id));
      state.currentUser = me || null;
    } catch (e) {
      state.currentUser = null;
    }
  }

  async function bindHeaderEvents() {
    buildAuthModal();
    buildTopupModal();

    var contactBtn = q("contactBtn");
    if (contactBtn) {
      contactBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        window.location.href = "contact.html";
      });
    }

    document.addEventListener("click", function (ev) {
      var closeBtn = ev.target.closest("[data-close-modal]");
      if (closeBtn) { closeModal(closeBtn.getAttribute("data-close-modal")); return; }
      if (ev.target.classList && ev.target.classList.contains("modal-backdrop")) closeAllModals();
    });

    var authModal = q("authModal");
    if (authModal) {
      authModal.addEventListener("click", function (ev) {
        var tab = ev.target.closest("[data-auth-tab]");
        if (!tab) return;
        var which = tab.getAttribute("data-auth-tab");
        document.querySelectorAll("[data-auth-tab]").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-auth-tab") === which);
        });
        q("loginForm").hidden = which !== "login";
        q("registerForm").hidden = which !== "register";
      });

      q("loginForm").addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var errEl = q("loginError");
        errEl.hidden = true;
        try {
          var res = await S.loginUser(q("loginLogin").value, q("loginPassword").value);
          S.setCurrentUserId(res.user.id);
          await fetchUserData();
          closeModal("authModal");
          renderHeader();
          afterAuthChange();
          window.showToast("Вы вошли как " + res.user.nick);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });

      q("registerForm").addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var errEl = q("registerError");
        errEl.hidden = true;
        try {
          var res = await S.registerUser(q("regLogin").value, q("regPassword").value, q("regNick").value);
          S.setCurrentUserId(res.user.id);
          await fetchUserData();
          closeModal("authModal");
          renderHeader();
          afterAuthChange();
          window.showToast("Аккаунт #" + res.user.id + " создан");
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    }

    var topupModal = q("topupModal");
    if (topupModal) {
      q("createInvoiceBtn").addEventListener("click", async function () {
        var errEl = q("topupError");
        errEl.hidden = true;
        if (!state.currentUser) { window.showToast("Войдите в аккаунт", "error"); return; }
        var amount = q("topupAmount").value;
        q("createInvoiceBtn").disabled = true;
        q("createInvoiceBtn").textContent = "Создаем...";

        var res = await G.createInvoice(state.currentUser.id, amount, "USDT");
        q("createInvoiceBtn").disabled = false;
        q("createInvoiceBtn").textContent = "Оплатить через CryptoBot (USDT)";

        if (!res.ok) { errEl.textContent = res.error; errEl.hidden = false; return; }
        
        state.topup.invoice = res.invoice;
        renderInvoice(res.invoice);
        q("topupStep1").hidden = true;
        q("topupStep2").hidden = false;
        q("checkError").hidden = true;
        q("checkSuccess").hidden = true;
      });

      q("payStarsBtn").addEventListener("click", function () {
        if (!state.currentUser) { window.showToast("Войдите в аккаунт", "error"); return; }
        var botLink = "https://t.me/RP_0BZVON_bot?start=pay_" + state.currentUser.id;
        window.open(botLink, "_blank");
        closeModal("topupModal");
        window.showToast("Перейдите в бота и оплатите Stars.", "success");
      });

      q("checkPaymentBtn").addEventListener("click", async function () {
        if (!state.topup.invoice) return;
        var inv = state.topup.invoice;
        var errEl = q("checkError");
        var okEl = q("checkSuccess");
        errEl.hidden = true; okEl.hidden = true;
        
        q("checkPaymentBtn").disabled = true;
        q("checkPaymentBtn").textContent = "Проверяем...";

        var res = await G.checkPayment(inv.invoiceId, state.currentUser.id);
        
        q("checkPaymentBtn").disabled = false;
        q("checkPaymentBtn").textContent = "Проверить оплату";
        
        if (!res.ok) { errEl.textContent = res.error; errEl.hidden = false; return; }
        
        okEl.textContent = "Зачислено " + money(res.amount) + ".";
        okEl.hidden = false;
        await fetchUserData();
        renderHeader();
        afterAuthChange();
      });

      q("backToTopupBtn").addEventListener("click", function () {
        q("topupStep1").hidden = false;
        q("topupStep2").hidden = true;
        state.topup.invoice = null;
      });
    }
  }

  function renderInvoice(inv) {
    var box = q("invoiceBox");
    if (!box) return;
    box.innerHTML =
      '<div class="invoice-row"><span>Сумма</span><span class="invoice-amount">' + money(inv.amount) + "</span></div>" +
      '<div class="invoice-row"><span>Сеть</span><span>USDT (CryptoBot)</span></div>' +
      '<p class="field-hint" style="margin-top: 10px;">Нажмите кнопку ниже, чтобы перейти на страницу оплаты.</p>' +
      '<div style="margin-top: 15px;">' +
        '<a href="' + inv.payUrl + '" target="_blank" class="btn btn-primary btn-block" style="text-decoration:none;">Перейти к оплате</a>' +
      '</div>';
  }

  function afterAuthChange() {
    if (q("profileNick")) renderProfile();
    if (q("projectOptions")) renderConstructor();
  }

  async function renderConstructor() {
    var prices = await S.getPrices();
    var projectsEl = q("projectOptions");
    var positionsEl = q("positionOptions");
    var extrasEl = q("extraOptions");
    if (!projectsEl || !positionsEl || !extrasEl) return;

    projectsEl.innerHTML = "";
    Object.keys(prices.projects).forEach(function (key) {
      var item = prices.projects[key];
      var div = document.createElement("div");
      div.className = "option-card" + (state.obzvon.projectKey === key ? " selected" : "");
      div.innerHTML = '<span class="option-card-name">' + esc(item.name) + '</span><span class="option-card-price">+' + money(item.price) + "</span>";
      div.onclick = function () { state.obzvon.projectKey = key; renderConstructor(); updateSummary(); };
      projectsEl.appendChild(div);
    });

    positionsEl.innerHTML = "";
    Object.keys(prices.positions).forEach(function (key) {
      var item = prices.positions[key];
      var div = document.createElement("div");
      div.className = "option-card" + (state.obzvon.positionKey === key ? " selected" : "");
      div.innerHTML = '<span class="option-card-name">' + esc(item.name) + '</span><span class="option-card-price">+' + money(item.price) + "</span>";
      div.onclick = function () { state.obzvon.positionKey = key; renderConstructor(); updateSummary(); };
      positionsEl.appendChild(div);
    });

    extrasEl.innerHTML = "";
    Object.keys(prices.extras).forEach(function (key) {
      var item = prices.extras[key];
      var checked = !!state.obzvon.extras[key];
      var row = document.createElement("label");
      row.className = "check-row" + (checked ? " checked" : "");
      row.innerHTML =
        '<input type="checkbox" ' + (checked ? "checked" : "") + ' data-extra="' + key + '">' +
        '<span class="check-label"><span class="check-name">' + esc(item.name) + "</span></span>" +
        '<span class="check-price">+' + money(item.price) + "</span>";
      var cb = row.querySelector("input");
      cb.onchange = function () { state.obzvon.extras[key] = cb.checked; renderConstructor(); updateSummary(); };
      extrasEl.appendChild(row);
    });

    var tgInput = q("tgInput");
    if (tgInput && !tgInput.dataset.bound) {
      tgInput.dataset.bound = "1";
      tgInput.addEventListener("input", function () { state.obzvon.telegram = tgInput.value.trim(); });
    }

    if (q("summaryBalance")) q("summaryBalance").textContent = state.currentUser ? money(state.currentUser.balance) : "—";
  }

  function calculateTotal(prices) {
    var total = 0;
    if (state.obzvon.projectKey && prices.projects[state.obzvon.projectKey]) total += prices.projects[state.obzvon.projectKey].price;
    if (state.obzvon.positionKey && prices.positions[state.obzvon.positionKey]) total += prices.positions[state.obzvon.positionKey].price;
    Object.keys(state.obzvon.extras).forEach(function (key) {
      if (state.obzvon.extras[key] && prices.extras[key]) total += prices.extras[key].price;
    });
    return Math.round(total * 100) / 100;
  }

  async function updateSummary() {
    var prices = await S.getPrices();
    var rows = q("summaryRows");
    var totalEl = q("summaryTotal");
    if (!rows || !totalEl) return;

    var items = [];
    if (state.obzvon.projectKey && prices.projects[state.obzvon.projectKey]) items.push({ name: "Проект: " + prices.projects[state.obzvon.projectKey].name, price: prices.projects[state.obzvon.projectKey].price });
    if (state.obzvon.positionKey && prices.positions[state.obzvon.positionKey]) items.push({ name: "Должность: " + prices.positions[state.obzvon.positionKey].name, price: prices.positions[state.obzvon.positionKey].price });
    Object.keys(state.obzvon.extras).forEach(function (key) {
      if (state.obzvon.extras[key] && prices.extras[key]) items.push({ name: prices.extras[key].name, price: prices.extras[key].price });
    });

    rows.innerHTML = items.length === 0 ? '<p class="field-hint">Выберите проект и должность.</p>' : "";
    items.forEach(function (it) {
      var div = document.createElement("div");
      div.className = "summary-row";
      div.innerHTML = "<span>" + esc(it.name) + "</span><span>" + money(it.price) + "</span>";
      rows.appendChild(div);
    });

    var total = calculateTotal(prices);
    totalEl.textContent = money(total);

    var user = state.currentUser;
    var warn = q("summaryWarn");
    var topupBtn = q("topupBtn");
    var buyBtn = q("buyBtn");
    var note = q("summaryNote");

    if (!user) {
      warn.hidden = true; topupBtn.hidden = true;
      buyBtn.disabled = false; buyBtn.textContent = "Войти и купить";
      note.textContent = "Для покупки нужен аккаунт.";
      return;
    }

    buyBtn.disabled = false; buyBtn.textContent = "Купить обзвон";
    if (user.balance < total) {
      warn.hidden = false; topupBtn.hidden = false; buyBtn.disabled = true;
    } else {
      warn.hidden = true; topupBtn.hidden = true;
    }
  }

  async function handleBuy() {
    if (!state.currentUser) { openModal("authModal"); return; }
    if (!state.obzvon.projectKey || !state.obzvon.positionKey) { window.showToast("Выберите проект и должность", "error"); return; }
    var tg = (q("tgInput") ? q("tgInput").value : "").trim();
    if (!tg || tg.length < 3) { window.showToast("Укажите Telegram", "error"); return; }

    var prices = await S.getPrices();
    var extrasArr = Object.keys(state.obzvon.extras)
      .filter(function (k) { return state.obzvon.extras[k] && prices.extras[k]; })
      .map(function (k) { return { name: prices.extras[k].name, price: prices.extras[k].price }; });

    var payload = {
      userId: state.currentUser.id,
      telegram: tg,
      projectName: prices.projects[state.obzvon.projectKey].name,
      positionName: prices.positions[state.obzvon.positionKey].name,
      extras: extrasArr,
      total: calculateTotal(prices)
    };

    try {
      await S.createOrder(payload);
      window.showToast("Заказ оплачен. Администратор свяжется с вами.");
      state.obzvon = { projectKey: null, positionKey: null, extras: {}, telegram: "" };
      if (q("tgInput")) q("tgInput").value = "";
      await fetchUserData();
      renderConstructor();
      updateSummary();
      renderHeader();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  }

  function bindConstructor() {
    if (q("buyBtn")) q("buyBtn").onclick = handleBuy;
    if (q("topupBtn")) {
      q("topupBtn").onclick = function () {
        state.topup.invoice = null;
        q("topupStep1").hidden = false;
        q("topupStep2").hidden = true;
        openModal("topupModal");
      };
    }
  }

  async function renderProfile() {
    var user = state.currentUser;
    var nickEl = q("profileNick");
    if (!nickEl) return;

    var guestCard = q("guestCard");
    var avatarWrap = q("avatarWrap");
    var profileId = q("profileId");
    var levelEl = q("profileLevel");
    var logoutBtn = q("logoutBtn");
    var credCard = q("saveCredBtn") ? q("saveCredBtn").closest(".profile-card") : null;

    if (!user) {
      nickEl.textContent = "Гость";
      profileId.textContent = "ID: —";
      levelEl.hidden = true;
      if (guestCard) guestCard.hidden = false;
      if (avatarWrap) avatarWrap.style.display = "none";
      if (logoutBtn) logoutBtn.hidden = true;
      if (credCard) credCard.hidden = true;
      drawAvatarCanvas(null);
      if (q("ordersTbody")) q("ordersTbody").innerHTML = "";
      if (q("ordersEmpty")) q("ordersEmpty").hidden = false;
      return;
    }

    if (guestCard) guestCard.hidden = true;
    if (avatarWrap) avatarWrap.style.display = "flex";
    if (logoutBtn) logoutBtn.hidden = false;
    if (credCard) credCard.hidden = false;

    nickEl.textContent = user.nick;
    profileId.textContent = "ID: #" + user.id;
    if (q("newLoginInput")) q("newLoginInput").value = user.login || "";
    if (user.level > 0) { levelEl.textContent = "Уровень доступа: " + user.level; levelEl.hidden = false; } else { levelEl.hidden = true; }

    drawAvatarCanvas(user);
    if (q("nickInput")) q("nickInput").value = user.nick;

    var orders = await S.getOrders(user.id, false);
    var ordersTbody = q("ordersTbody");
    if (!ordersTbody) return;
    ordersTbody.innerHTML = "";

    if (orders.length === 0) {
      if (q("ordersEmpty")) q("ordersEmpty").hidden = false;
      return;
    }
    if (q("ordersEmpty")) q("ordersEmpty").hidden = true;

    orders.forEach(function (o) {
      var tr = document.createElement("tr");
      var extrasText = JSON.parse(o.extras || "[]").map(function (e) { return esc(e.name || e); }).join(", ") || "—";
      var status;
      if (o.status === "pending") status = '<span class="status-badge status-pending">Ожидает</span>';
      else if (o.status === "in_progress") status = '<span class="status-badge status-progress">В работе</span>';
      else status = '<span class="status-badge status-done">Завершён</span>';

      tr.innerHTML =
        "<td>#" + esc(o.id) + "</td>" +
        "<td>" + esc(new Date(o.created_at).toLocaleDateString("ru-RU")) + "</td>" +
        "<td>" + esc(o.project_name) + "</td>" +
        "<td>" + esc(o.position_name) + "</td>" +
        "<td>" + extrasText + "</td>" +
        "<td>" + money(o.total) + "</td>" +
        "<td>" + status + "</td>";
      ordersTbody.appendChild(tr);
    });
  }

  function bindProfile() {
    if (q("guestLoginBtn")) q("guestLoginBtn").onclick = function () { openModal("authModal"); };
    if (q("guestRegisterBtn")) q("guestRegisterBtn").onclick = function () { openModal("authModal"); };

    if (q("logoutBtn")) {
      q("logoutBtn").onclick = function () {
        S.logout();
        window.location.href = "index.html";
      };
    }

    if (q("avatarInput")) {
      q("avatarInput").addEventListener("change", function () {
        var file = this.files && this.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) { window.showToast("Файл больше 1.5 МБ", "error"); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          var img = new Image();
          img.onload = function () {
            var canvas = document.createElement("canvas");
            canvas.width = 128; canvas.height = 128;
            var ctx = canvas.getContext("2d");
            var min = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, 128, 128);
            var resized = canvas.toDataURL("image/jpeg", 0.85);
            S.updateProfile(state.currentUser.id, { avatar: resized, nick: state.currentUser.nick }).then(function(res) {
              state.currentUser = res.user;
              renderHeader();
              renderProfile();
              window.showToast("Аватар обновлён");
            });
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        this.value = "";
      });
    }

    if (q("saveNickBtn")) {
      q("saveNickBtn").onclick = async function () {
        var newNick = (q("nickInput").value || "").trim();
        if (newNick.length < 3) { window.showToast("Ник минимум 3 символа", "error"); return; }
        try {
          var res = await S.updateProfile(state.currentUser.id, { nick: newNick, avatar: state.currentUser.avatar });
          state.currentUser = res.user;
          renderHeader();
          renderProfile();
          window.showToast("Ник обновлён");
        } catch (err) { window.showToast(err.message, "error"); }
      };
    }

    if (q("saveCredBtn")) {
      q("saveCredBtn").onclick = async function () {
        var newLogin = q("newLoginInput").value;
        var newPass = q("newPasswordInput").value;
        if (newLogin.length < 3) { window.showToast("Логин минимум 3 символа", "error"); return; }
        
        var payload = { 
          nick: state.currentUser.nick, 
          avatar: state.currentUser.avatar,
          newLogin: newLogin
        };

        if (newPass && newPass.length > 0) {
            if (newPass.length < 4) { window.showToast("Пароль минимум 4 символа", "error"); return; }
            payload.newPassword = newPass;
        }
        
        try {
          var res = await S.updateProfile(state.currentUser.id, payload);
          state.currentUser = res.user;
          window.showToast("Данные для входа сохранены");
          
          if (q("newPasswordInput")) q("newPasswordInput").value = "";

          if (q("credHint")) {
            q("credHint").textContent = "Данные обновлены";
            q("credHint").className = "field-hint field-hint-success";
            q("credHint").hidden = false;
            setTimeout(function() { q("credHint").hidden = true; }, 3000);
          }
        } catch (err) { window.showToast(err.message, "error"); }
      };
    }
  }

  async function init() {
    await fetchUserData();
    renderHeader();
    await bindHeaderEvents();

    if (q("projectOptions")) {
      await renderConstructor();
      await updateSummary();
      bindConstructor();
    }

    if (q("profileNick")) {
      await renderProfile();
      bindProfile();
    }

    if (q("heroLoginBtn")) {
      q("heroLoginBtn").onclick = function () {
        if (state.currentUser) window.location.href = "profile.html";
        else openModal("authModal");
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
