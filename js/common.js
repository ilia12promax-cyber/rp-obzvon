(function () {
  "use strict";

  var S = window.AppStorage;
  var G = window.GramWalletAPI;

  if (!S || !G) return;

  var state = {
    obzvon: {
      projectKey: null,
      positionKey: null,
      extras: {},
      telegram: ""
    },
    topup: {
      network: "TON",
      invoice: null
    }
  };

  var els = {};

  function q(id) {
    return document.getElementById(id);
  }

  function esc(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    setTimeout(function () {
      if (div.parentNode) div.remove();
    }, 3200);
  };

  function initials(nick) {
    if (!nick) return "?";
    var parts = String(nick).trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return String(nick).substring(0, 2).toUpperCase();
  }

  function avatarHTML(user, size) {
    var px = size || 32;
    var style = "width:" + px + "px;height:" + px + "px;";
    if (user && user.avatar) {
      return '<span class="header-avatar" style="' + style + '"><img src="' + user.avatar + '" alt=""></span>';
    }
    return '<span class="header-avatar" style="' + style + '">' + esc(initials(user && user.nick)) + "</span>";
  }

  function drawAvatarCanvas(user) {
    var canvas = q("avatarCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (user && user.avatar) {
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0, w, h);
      };
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
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    var el = q(id);
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach(function (m) {
      m.hidden = true;
    });
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
          "<h3>Аккаунт</h3>" +
          '<button class="modal-close" type="button" data-close-modal="authModal">×</button>' +
        "</div>" +
        '<div class="modal-body">' +
          '<div class="modal-tabs">' +
            '<button class="modal-tab active" type="button" data-auth-tab="login">Вход</button>' +
            '<button class="modal-tab" type="button" data-auth-tab="register">Регистрация</button>' +
          "</div>" +
          '<form id="loginForm" class="auth-form">' +
            '<div class="field"><label for="loginLogin">Логин</label><input class="input" id="loginLogin" autocomplete="username"></div>' +
            '<div class="field"><label for="loginPassword">Пароль</label><input class="input" id="loginPassword" type="password" autocomplete="current-password"></div>' +
            '<div class="form-error" id="loginError" hidden></div>' +
            '<div class="modal-actions"><button class="btn btn-primary btn-block" type="submit">Войти</button></div>' +
          "</form>" +
          '<form id="registerForm" class="auth-form" hidden>' +
            '<div class="field"><label for="regLogin">Логин</label><input class="input" id="regLogin" autocomplete="username"></div>' +
            '<div class="field"><label for="regNick">Ник</label><input class="input" id="regNick" maxlength="24"></div>' +
            '<div class="field"><label for="regPassword">Пароль</label><input class="input" id="regPassword" type="password" autocomplete="new-password"></div>' +
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
          "<h3>Пополнение через CryptoBot</h3>" +
          '<button class="modal-close" type="button" data-close-modal="topupModal">×</button>' +
        "</div>" +
        '<div class="modal-body">' +
          '<div id="topupStep1">' +
            '<div class="field"><label for="topupAmount">Сумма, USDT</label><input class="input" id="topupAmount" type="number" min="1" step="0.5" value="10"></div>' +
            '<div class="form-error" id="topupError" hidden></div>' +
            '<div class="modal-actions"><button class="btn btn-primary btn-block" id="createInvoiceBtn" type="button">Создать инвойс</button></div>' +
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

    var user = S.getCurrentUser();
    var navAdmin = q("navAdmin");
    if (navAdmin) {
      if (user && user.level >= 1) {
        navAdmin.hidden = false;
      } else {
        navAdmin.hidden = true;
      }
    }

    headerRight.innerHTML = "";

    if (!user) {
      var loginBtn = document.createElement("button");
      loginBtn.className = "btn btn-outline btn-sm";
      loginBtn.type = "button";
      loginBtn.textContent = "Вход";
      loginBtn.addEventListener("click", function () { openModal("authModal"); });

      var regBtn = document.createElement("button");
      regBtn.className = "btn btn-primary btn-sm";
      regBtn.type = "button";
      regBtn.textContent = "Регистрация";
      regBtn.addEventListener("click", function () { openModal("authModal"); });

      headerRight.appendChild(loginBtn);
      headerRight.appendChild(regBtn);
      return;
    }

    var balance = document.createElement("span");
    balance.className = "balance-pill";
    balance.textContent = money(user.balance);

    var topup = document.createElement("button");
    topup.className = "btn btn-primary btn-sm";
    topup.type = "button";
    topup.textContent = "Пополнить";
    topup.addEventListener("click", function () {
      state.topup.invoice = null;
      var s1 = q("topupStep1");
      var s2 = q("topupStep2");
      if (s1) s1.hidden = false;
      if (s2) s2.hidden = true;
      openModal("topupModal");
    });

    var userLink = document.createElement("a");
    userLink.href = "profile.html";
    userLink.className = "header-user";
    userLink.innerHTML = avatarHTML(user, 32) + '<span class="header-nick">' + esc(user.nick) + "</span>";

    headerRight.appendChild(balance);
    headerRight.appendChild(topup);
    headerRight.appendChild(userLink);
  }

  function bindHeaderEvents() {
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
      if (closeBtn) {
        closeModal(closeBtn.getAttribute("data-close-modal"));
        return;
      }
      if (ev.target.classList && ev.target.classList.contains("modal-backdrop")) {
        closeAllModals();
      }
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeAllModals();
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

      q("loginForm").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var errEl = q("loginError");
        errEl.hidden = true;
        var res = S.loginUser(q("loginLogin").value, q("loginPassword").value);
        if (!res.ok) {
          errEl.textContent = res.error;
          errEl.hidden = false;
          return;
        }
        S.setSession(res.user.id);
        closeModal("authModal");
        renderHeader();
        afterAuthChange();
        window.showToast("Вы вошли как " + res.user.nick);
      });

      q("registerForm").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var errEl = q("registerError");
        errEl.hidden = true;
        var res = S.registerUser(q("regLogin").value, q("regPassword").value, q("regNick").value);
        if (!res.ok) {
          errEl.textContent = res.error;
          errEl.hidden = false;
          return;
        }
        S.setSession(res.user.id);
        closeModal("authModal");
        renderHeader();
        afterAuthChange();
        window.showToast("Аккаунт #" + res.user.id + " создан");
      });
    }

    var topupModal = q("topupModal");
    if (topupModal) {
      q("createInvoiceBtn").addEventListener("click", function () {
        var errEl = q("topupError");
        errEl.hidden = true;
        var user = S.getCurrentUser();
        if (!user) {
          window.showToast("Сначала войдите в аккаунт", "error");
          return;
        }
        var amount = q("topupAmount").value;
        
        q("createInvoiceBtn").disabled = true;
        q("createInvoiceBtn").textContent = "Создаем...";

        G.createInvoice(user.id, amount, "USDT").then(function (res) {
          q("createInvoiceBtn").disabled = false;
          q("createInvoiceBtn").textContent = "Создать инвойс";

          if (!res.ok) {
            errEl.textContent = res.error;
            errEl.hidden = false;
            return;
          }
          state.topup.invoice = res.invoice;
          renderInvoice(res.invoice);
          q("topupStep1").hidden = true;
          q("topupStep2").hidden = false;
          q("checkError").hidden = true;
          q("checkSuccess").hidden = true;
        });
      });

      q("checkPaymentBtn").addEventListener("click", function () {
        if (!state.topup.invoice) return;
        var inv = state.topup.invoice;
        var errEl = q("checkError");
        var okEl = q("checkSuccess");
        errEl.hidden = true;
        okEl.hidden = true;
        q("checkPaymentBtn").disabled = true;
        q("checkPaymentBtn").textContent = "Проверяем...";

        G.checkPayment(inv.invoiceId).then(function (res) {
          q("checkPaymentBtn").disabled = false;
          q("checkPaymentBtn").textContent = "Проверить оплату";
          if (!res.ok) {
            errEl.textContent = res.error;
            errEl.hidden = false;
            return;
          }
          okEl.textContent = "Зачислено " + money(res.amount) + ". Новый баланс: " + money(res.newBalance);
          okEl.hidden = false;
          renderHeader();
          afterAuthChange();
        });
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
      '<p class="field-hint" style="margin-top: 10px;">Нажмите кнопку ниже, чтобы перейти на страницу оплаты. После оплаты возвращайтесь сюда и нажмите «Проверить оплату».</p>' +
      '<div style="margin-top: 15px;">' +
        '<a href="' + inv.payUrl + '" target="_blank" class="btn btn-primary btn-block" style="text-decoration:none;">Перейти к оплате</a>' +
      '</div>';
  }

  function afterAuthChange() {
    if (q("profileNick")) renderProfile();
    if (q("projectOptions")) renderConstructor();
  }

  function renderConstructor() {
    var user = S.getCurrentUser();
    var prices = S.getPrices();

    var projectsEl = q("projectOptions");
    var positionsEl = q("positionOptions");
    var extrasEl = q("extraOptions");
    if (!projectsEl || !positionsEl || !extrasEl) return;

    projectsEl.innerHTML = "";
    Object.keys(prices.projects).forEach(function (key) {
      var item = prices.projects[key];
      var div = document.createElement("div");
      div.className = "option-card" + (state.obzvon.projectKey === key ? " selected" : "");
      div.innerHTML = '<span class="option-card-name">' + esc(item.name) + '</span>' +
        '<span class="option-card-price">+' + money(item.price) + "</span>";
      div.addEventListener("click", function () {
        state.obzvon.projectKey = key;
        renderConstructor();
        updateSummary();
      });
      projectsEl.appendChild(div);
    });

    positionsEl.innerHTML = "";
    Object.keys(prices.positions).forEach(function (key) {
      var item = prices.positions[key];
      var div = document.createElement("div");
      div.className = "option-card" + (state.obzvon.positionKey === key ? " selected" : "");
      div.innerHTML = '<span class="option-card-name">' + esc(item.name) + '</span>' +
        '<span class="option-card-price">+' + money(item.price) + "</span>";
      div.addEventListener("click", function () {
        state.obzvon.positionKey = key;
        renderConstructor();
        updateSummary();
      });
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
      cb.addEventListener("change", function () {
        state.obzvon.extras[key] = cb.checked;
        renderConstructor();
        updateSummary();
      });
      extrasEl.appendChild(row);
    });

    var tgInput = q("tgInput");
    if (tgInput && !tgInput.dataset.bound) {
      tgInput.dataset.bound = "1";
      tgInput.addEventListener("input", function () {
        state.obzvon.telegram = tgInput.value.trim();
      });
    }

    if (q("summaryBalance")) {
      q("summaryBalance").textContent = user ? money(user.balance) : "—";
    }
  }

  function calculateTotal() {
    var prices = S.getPrices();
    var total = 0;
    if (state.obzvon.projectKey && prices.projects[state.obzvon.projectKey]) {
      total += prices.projects[state.obzvon.projectKey].price;
    }
    if (state.obzvon.positionKey && prices.positions[state.obzvon.positionKey]) {
      total += prices.positions[state.obzvon.positionKey].price;
    }
    Object.keys(state.obzvon.extras).forEach(function (key) {
      if (state.obzvon.extras[key] && prices.extras[key]) {
        total += prices.extras[key].price;
      }
    });
    return Math.round(total * 100) / 100;
  }

  function updateSummary() {
    var rows = q("summaryRows");
    var totalEl = q("summaryTotal");
    if (!rows || !totalEl) return;

    var prices = S.getPrices();
    var items = [];

    if (state.obzvon.projectKey && prices.projects[state.obzvon.projectKey]) {
      items.push({ name: "Проект: " + prices.projects[state.obzvon.projectKey].name, price: prices.projects[state.obzvon.projectKey].price });
    }
    if (state.obzvon.positionKey && prices.positions[state.obzvon.positionKey]) {
      items.push({ name: "Должность: " + prices.positions[state.obzvon.positionKey].name, price: prices.positions[state.obzvon.positionKey].price });
    }
    Object.keys(state.obzvon.extras).forEach(function (key) {
      if (state.obzvon.extras[key] && prices.extras[key]) {
        items.push({ name: prices.extras[key].name, price: prices.extras[key].price });
      }
    });

    rows.innerHTML = "";
    if (items.length === 0) {
      rows.innerHTML = '<p class="field-hint">Выберите проект и должность.</p>';
    } else {
      items.forEach(function (it) {
        var div = document.createElement("div");
        div.className = "summary-row";
        div.innerHTML = "<span>" + esc(it.name) + "</span><span>" + money(it.price) + "</span>";
        rows.appendChild(div);
      });
    }

    var total = calculateTotal();
    totalEl.textContent = money(total);

    var user = S.getCurrentUser();
    var warn = q("summaryWarn");
    var topupBtn = q("topupBtn");
    var buyBtn = q("buyBtn");
    var note = q("summaryNote");

    if (!user) {
      if (warn) warn.hidden = true;
      if (topupBtn) topupBtn.hidden = true;
      if (buyBtn) { buyBtn.disabled = false; buyBtn.textContent = "Войти и купить"; }
      if (note) note.textContent = "Для покупки нужен аккаунт.";
      return;
    }

    if (buyBtn) { buyBtn.disabled = false; buyBtn.textContent = "Купить обзвон"; }
    if (user.balance < total) {
      if (warn) warn.hidden = false;
      if (topupBtn) topupBtn.hidden = false;
      if (buyBtn) buyBtn.disabled = true;
    } else {
      if (warn) warn.hidden = true;
      if (topupBtn) topupBtn.hidden = true;
    }
  }

  function handleBuy() {
    var user = S.getCurrentUser();
    if (!user) {
      openModal("authModal");
      return;
    }
    if (!state.obzvon.projectKey || !state.obzvon.positionKey) {
      window.showToast("Выберите проект и должность", "error");
      return;
    }
    var tg = (q("tgInput") ? q("tgInput").value : "").trim();
    if (!tg || tg.length < 3) {
      window.showToast("Укажите Telegram для связи", "error");
      if (q("tgInput")) q("tgInput").classList.add("input-error");
      return;
    }
    if (q("tgInput")) q("tgInput").classList.remove("input-error");

    var prices = S.getPrices();
    var extrasArr = Object.keys(state.obzvon.extras)
      .filter(function (k) { return state.obzvon.extras[k] && prices.extras[k]; })
      .map(function (k) { return { key: k, name: prices.extras[k].name, price: prices.extras[k].price }; });

    var payload = {
      userId: user.id,
      telegram: tg,
      projectKey: state.obzvon.projectKey,
      projectName: prices.projects[state.obzvon.projectKey].name,
      positionKey: state.obzvon.positionKey,
      positionName: prices.positions[state.obzvon.positionKey].name,
      extras: extrasArr,
      total: calculateTotal()
    };

    var res = S.createOrder(payload);
    if (!res.ok) {
      window.showToast(res.error, "error");
      return;
    }
    window.showToast("Заказ #" + res.order.id + " оплачен. Администратор свяжется с вами.");
    state.obzvon = { projectKey: null, positionKey: null, extras: {}, telegram: "" };
    if (q("tgInput")) q("tgInput").value = "";
    renderConstructor();
    updateSummary();
    renderHeader();
  }

  function bindConstructor() {
    var buyBtn = q("buyBtn");
    if (buyBtn) buyBtn.addEventListener("click", handleBuy);
    var topupBtn = q("topupBtn");
    if (topupBtn) {
      topupBtn.addEventListener("click", function () {
        state.topup.invoice = null;
        q("topupStep1").hidden = false;
        q("topupStep2").hidden = true;
        openModal("topupModal");
      });
    }
  }

  function renderProfile() {
    var user = S.getCurrentUser();
    var nickEl = q("profileNick");
    if (!nickEl) return;

    var guestCard = q("guestCard");
    var avatarWrap = q("avatarWrap");
    var profileId = q("profileId");
    var levelEl = q("profileLevel");
    var ordersTbody = q("ordersTbody");
    var ordersEmpty = q("ordersEmpty");
    var logoutBtn = q("logoutBtn");
    
    // Поля безопасности
    var newLoginInput = q("newLoginInput");
    var newPasswordInput = q("newPasswordInput");
    var credCard = q("saveCredBtn") ? q("saveCredBtn").closest(".profile-card") : null;

    if (!user) {
      nickEl.textContent = "Гость";
      profileId.textContent = "ID: —";
      levelEl.hidden = true;
      if (guestCard) guestCard.hidden = false;
      if (avatarWrap) avatarWrap.style.display = "none";
      if (logoutBtn) logoutBtn.hidden = true;
      if (credCard) credCard.hidden = true; // Скрываем смену пароля для гостей
      
      drawAvatarCanvas(null);
      if (ordersTbody) ordersTbody.innerHTML = "";
      if (ordersEmpty) ordersEmpty.hidden = false;
      return;
    }

    if (guestCard) guestCard.hidden = true;
    if (avatarWrap) avatarWrap.style.display = "flex";
    if (logoutBtn) logoutBtn.hidden = false;
    if (credCard) credCard.hidden = false; // Показываем смену пароля
    
    nickEl.textContent = user.nick;
    profileId.textContent = "ID: #" + user.id;
    
    // Заполняем поля текущими логином и паролем
    if (newLoginInput) newLoginInput.value = user.login || "";
    if (newPasswordInput) newPasswordInput.value = user.password || "";

    if (user.level > 0) {
      levelEl.textContent = "Уровень доступа: " + user.level;
      levelEl.hidden = false;
    } else {
      levelEl.hidden = true;
    }
    drawAvatarCanvas(user);

    var nickInput = q("nickInput");
    if (nickInput) nickInput.value = user.nick;

    var orders = S.getOrders().filter(function (o) {
      return String(o.userId) === String(user.id);
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });

    if (!ordersTbody) return;
    ordersTbody.innerHTML = "";

    if (orders.length === 0) {
      if (ordersEmpty) ordersEmpty.hidden = false;
      return;
    }
    if (ordersEmpty) ordersEmpty.hidden = true;

    orders.forEach(function (o) {
      var tr = document.createElement("tr");
      var extrasText = (o.extras || []).map(function (e) { return esc(e.name || e); }).join(", ") || "—";
      var status;
      if (o.status === "pending") status = '<span class="status-badge status-pending">Ожидает</span>';
      else if (o.status === "in_progress") status = '<span class="status-badge status-progress">В работе у ' + esc(o.assignedNick || "—") + "</span>";
      else status = '<span class="status-badge status-done">Завершён</span>';

      tr.innerHTML =
        "<td>#" + esc(o.id) + "</td>" +
        "<td>" + esc(new Date(o.createdAt).toLocaleDateString("ru-RU")) + "</td>" +
        "<td>" + esc(o.projectName) + "</td>" +
        "<td>" + esc(o.positionName) + "</td>" +
        "<td>" + extrasText + "</td>" +
        "<td>" + money(o.total) + "</td>" +
        "<td>" + status + "</td>";
      ordersTbody.appendChild(tr);
    });
  }

  function bindProfile() {
    var loginBtn = q("guestLoginBtn");
    if (loginBtn) loginBtn.addEventListener("click", function () { openModal("authModal"); });
    var regBtn = q("guestRegisterBtn");
    if (regBtn) regBtn.addEventListener("click", function () { openModal("authModal"); });

    var logoutBtn = q("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        S.logout();
        window.location.href = "index.html";
      });
    }

    var avatarInput = q("avatarInput");
    if (avatarInput) {
      avatarInput.addEventListener("change", function () {
        var file = avatarInput.files && avatarInput.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) {
          window.showToast("Нужен файл изображения", "error");
          return;
        }
        if (file.size > 1.5 * 1024 * 1024) {
          window.showToast("Файл больше 1.5 МБ", "error");
          return;
        }
        var user = S.getCurrentUser();
        if (!user) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var dataUrl = ev.target.result;
          var img = new Image();
          img.onload = function () {
            var canvas = document.createElement("canvas");
            var size = 128;
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext("2d");
            var min = Math.min(img.width, img.height);
            var sx = (img.width - min) / 2;
            var sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            var resized = canvas.toDataURL("image/jpeg", 0.85);
            S.updateUser(user.id, { avatar: resized });
            renderHeader();
            renderProfile();
            window.showToast("Аватар обновлён");
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
        avatarInput.value = "";
      });
    }

    var saveNickBtn = q("saveNickBtn");
    if (saveNickBtn) {
      saveNickBtn.addEventListener("click", function () {
        var user = S.getCurrentUser();
        if (!user) return;
        var newNick = (q("nickInput").value || "").trim();
        var hint = q("nickHint");
        if (newNick.length < 3) {
          if (hint) { hint.textContent = "Минимум 3 символа"; hint.className = "field-hint field-hint-error"; hint.hidden = false; }
          return;
        }
        if (newNick.length > 24) {
          if (hint) { hint.textContent = "Максимум 24 символа"; hint.className = "field-hint field-hint-error"; hint.hidden = false; }
          return;
        }
        S.updateUser(user.id, { nick: newNick });
        if (hint) { hint.textContent = "Ник сохранён"; hint.className = "field-hint field-hint-success"; hint.hidden = false; setTimeout(function () { hint.hidden = true; }, 2000); }
        renderHeader();
        renderProfile();
        window.showToast("Ник обновлён");
      });
    }

    // Обработчик сохранения логина и пароля
    var saveCredBtn = q("saveCredBtn");
    if (saveCredBtn) {
      saveCredBtn.addEventListener("click", function () {
        var user = S.getCurrentUser();
        if (!user) return;
        var newLogin = q("newLoginInput").value;
        var newPassword = q("newPasswordInput").value;
        var hint = q("credHint");
        
        var res = S.changeCredentials(user.id, newLogin, newPassword);
        if (!res.ok) {
          if (hint) { hint.textContent = res.error; hint.className = "field-hint field-hint-error"; hint.hidden = false; }
          return;
        }
        
        if (hint) { 
          hint.textContent = "Данные для входа обновлены"; 
          hint.className = "field-hint field-hint-success"; 
          hint.hidden = false; 
          setTimeout(function () { hint.hidden = true; }, 2000); 
        }
        window.showToast("Логин и пароль сохранены");
      });
    }
  }

  function bindGlobalPriceSync() {
    window.addEventListener("storage", function (ev) {
      if (ev.key === S.KEYS.prices) {
        if (q("projectOptions")) { renderConstructor(); updateSummary(); }
      }
      if (ev.key === S.KEYS.users) {
        renderHeader();
        afterAuthChange();
      }
    });
  }

  function init() {
    els.headerRight = q("headerRight");
    bindHeaderEvents();
    renderHeader();
    bindGlobalPriceSync();

    if (q("projectOptions")) {
      renderConstructor();
      updateSummary();
      bindConstructor();
    }

    if (q("profileNick")) {
      renderProfile();
      bindProfile();
    }

    var heroLogin = q("heroLoginBtn");
    if (heroLogin) {
      heroLogin.addEventListener("click", function () {
        var user = S.getCurrentUser();
        if (user) {
          window.location.href = "profile.html";
        } else {
          openModal("authModal");
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();