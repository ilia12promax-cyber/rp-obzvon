(function () {
  "use strict";

  if (!window.AppStorage) return;
  var S = window.AppStorage;

  var state = {
    currentUser: null,
    activeTab: "orders",
    statusFilter: "all",
    prices: null
  };

  var els = {};

  function q(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(msg, type) {
    if (window.showToast) window.showToast(msg, type);
  }

  function formatMoney(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2) + " USDT";
  }

  function formatDate(isoString) {
    if (!isoString) return "—";
    var d = new Date(isoString);
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return dd + "." + mm + " " + hh + ":" + mi;
  }

  async function guardAccess() {
    // Ждем загрузки данных пользователя из common.js
    await new Promise(resolve => setTimeout(resolve, 500));
    var user = window.AppStorage.getCurrentUser ? window.AppStorage.getCurrentUser() : null;
    // В новой версии common.js пользователь хранится в state, но мы можем получить его из глобальной области
    // Проще всего проверить, есть ли ID сессии
    var userId = S.getCurrentUserId();
    if (!userId) { window.location.href = "index.html"; return false; }
    
    // Запрашиваем данные пользователя, чтобы узнать уровень
    try {
      var users = await S.getUsers();
      var me = users.find(u => String(u.id) === String(userId));
      if (!me || me.level < 1) {
        window.location.href = "index.html";
        return false;
      }
      state.currentUser = me;
      return true;
    } catch (e) {
      window.location.href = "index.html";
      return false;
    }
  }

  function renderLevelInfo() {
    var u = state.currentUser;
    els.adminLevelInfo.textContent = "Уровень доступа: " + u.level + " · " + u.nick + " · ID #" + u.id;
    if (u.level >= 9) els.tabPricesBtn.hidden = false;
    if (u.level >= 10) els.tabStaffBtn.hidden = false;
  }

  function statusBadge(status, assignedNick) {
    if (status === "pending") return '<span class="status-badge status-pending">Ожидает</span>';
    if (status === "in_progress") return '<span class="status-badge status-progress">В работе у ' + esc(assignedNick || "—") + "</span>";
    return '<span class="status-badge status-done">Завершён</span>';
  }

  async function renderOrders() {
    var orders = await S.getOrders(state.currentUser.id, true);
    var filter = state.statusFilter;
    var visible = orders.filter(function (o) {
      if (filter === "all") return true;
      return o.status === filter;
    });
    
    // Сортировка (на случай, если база не отсортировала)
    visible.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    els.ordersTbody.innerHTML = "";
    if (visible.length === 0) {
      els.ordersEmpty.hidden = false;
      return;
    }
    els.ordersEmpty.hidden = true;

    var me = state.currentUser;
    var frag = document.createDocumentFragment();

    visible.forEach(function (o) {
      var tr = document.createElement("tr");
      var extrasText = JSON.parse(o.extras || "[]").map(function (e) { return esc(e.name || e); }).join(", ") || "—";
      
      var canClaim = o.status === "pending";
      var canComplete = o.status === "in_progress" && String(o.assigned_to) === String(me.id);
      var canContact = o.status === "in_progress" || o.status === "done";

      var actions = "";
      if (canClaim) {
        actions += '<button class="btn btn-primary btn-sm" data-action="claim" data-id="' + esc(o.id) + '">Взять</button> ';
      }
      
      if (canContact) {
        var tgLink = "https://t.me/" + String(o.telegram || "").replace("@", "").trim();
        if (!o.telegram || tgLink === "https://t.me/") tgLink = "https://t.me";
        actions += '<a class="btn btn-outline btn-sm" href="' + tgLink + '" target="_blank" rel="noopener">Связаться</a> ';
      }
      
      if (canComplete) {
        actions += '<button class="btn btn-success btn-sm" data-action="complete" data-id="' + esc(o.id) + '">Завершить</button>';
      }
      if (!actions) actions = "—";

      tr.innerHTML =
        "<td>#" + esc(o.id) + "</td>" +
        "<td>" + esc(o.user_nick) + "</td>" +
        "<td>" + esc(o.user_id) + "</td>" +
        "<td>" + esc(o.telegram || "—") + "</td>" +
        "<td>" + esc(o.project_name) + "</td>" +
        "<td>" + esc(o.position_name) + "</td>" +
        "<td>" + extrasText + "</td>" +
        "<td>" + formatMoney(o.total) + "</td>" +
        "<td>" + statusBadge(o.status, o.assigned_nick) + "</td>" +
        "<td>" + actions + "</td>";

      frag.appendChild(tr);
    });

    els.ordersTbody.appendChild(frag);
  }

  async function handleOrderAction(ev) {
    var btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");

    btn.disabled = true;

    try {
      if (action === "claim") {
        await S.claimOrder(id, state.currentUser.id);
        toast("Заказ #" + id + " закреплён за вами");
      } else if (action === "complete") {
        await S.completeOrder(id, state.currentUser.id);
        toast("Заказ #" + id + " завершён");
      }
      await renderOrders();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  function renderPriceGroup(container, groupKey, groupData) {
    container.innerHTML = "";
    Object.keys(groupData).forEach(function (key) {
      var item = groupData[key];
      var row = document.createElement("div");
      row.className = "price-row";
      row.innerHTML =
        '<span class="price-row-label">' + esc(item.name) + "</span>" +
        '<input type="number" step="0.1" min="0" data-group="' + groupKey + '" data-key="' + key + '" value="' + esc(item.price) + '">';
      container.appendChild(row);
    });
  }

  async function renderPrices() {
    state.prices = await S.getPrices();
    renderPriceGroup(els.priceProjects, "projects", state.prices.projects);
    renderPriceGroup(els.pricePositions, "positions", state.prices.positions);
    renderPriceGroup(els.priceExtras, "extras", state.prices.extras);
  }

  async function savePrices() {
    var inputs = document.querySelectorAll(".price-row input[data-group]");
    var invalid = false;
    var newPrices = JSON.parse(JSON.stringify(state.prices));

    inputs.forEach(function (inp) {
      var group = inp.getAttribute("data-group");
      var key = inp.getAttribute("data-key");
      var val = parseFloat(inp.value);
      if (isNaN(val) || val < 0) {
        invalid = true;
        inp.classList.add("input-error");
        return;
      }
      inp.classList.remove("input-error");
      if (newPrices[group] && newPrices[group][key]) {
        newPrices[group][key].price = Math.round(val * 100) / 100;
      }
    });

    if (invalid) {
      toast("Проверьте цены", "error");
      return;
    }

    els.savePricesBtn.disabled = true;
    try {
      await S.savePrices(newPrices);
      els.priceSaveNote.hidden = false;
      setTimeout(function () { els.priceSaveNote.hidden = true; }, 2000);
      toast("Цены сохранены");
    } catch (err) {
      toast(err.message, "error");
    }
    els.savePricesBtn.disabled = false;
  }

  async function renderStaff() {
    var users = await S.getUsers();
    users.sort(function (a, b) {
      return Number(b.level) - Number(a.level) || Number(a.id) - Number(b.id);
    });
    els.staffTbody.innerHTML = "";
    users.forEach(function (u) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>#" + esc(u.id) + "</td>" +
        "<td>" + esc(u.nick) + "</td>" +
        "<td>" + esc(u.login) + "</td>" +
        "<td>" + esc(u.level) + "</td>" +
        "<td>" + formatMoney(u.balance) + "</td>";
      els.staffTbody.appendChild(tr);
    });
  }

  async function applyLevel() {
    var id = (els.staffIdInput.value || "").trim().replace(/^#/, "");
    var level = parseInt(els.staffLevelInput.value, 10);
    els.staffHint.hidden = true;
    
    if (!id) {
      els.staffHint.textContent = "Введите ID";
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
      return;
    }
    if (isNaN(level) || level < 0 || level > 10) {
      els.staffHint.textContent = "Уровень 0–10";
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
      return;
    }

    els.setLevelBtn.disabled = true;
    try {
      await S.setUserLevel(id, level);
      els.staffHint.textContent = "Уровень обновлён";
      els.staffHint.className = "field-hint field-hint-success";
      els.staffHint.hidden = false;
      els.staffIdInput.value = "";
      await renderStaff();
      toast("Уровень обновлён");
    } catch (err) {
      els.staffHint.textContent = err.message;
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
    }
    els.setLevelBtn.disabled = false;
  }

  async function switchTab(tab) {
    state.activeTab = tab;
    els.tabs.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    els.panelOrders.hidden = tab !== "orders";
    els.panelPrices.hidden = tab !== "prices";
    els.panelStaff.hidden = tab !== "staff";

    if (tab === "orders") await renderOrders();
    if (tab === "prices") await renderPrices();
    if (tab === "staff") await renderStaff();
  }

  function cacheEls() {
    els.adminLevelInfo = q("adminLevelInfo");
    els.tabs = document.querySelectorAll(".tab-btn");
    els.panelOrders = q("panelOrders");
    els.panelPrices = q("panelPrices");
    els.panelStaff = q("panelStaff");
    els.tabPricesBtn = q("tabPricesBtn");
    els.tabStaffBtn = q("tabStaffBtn");
    els.ordersTbody = q("adminOrdersTbody");
    els.ordersEmpty = q("adminOrdersEmpty");
    els.statusFilter = q("statusFilter");
    els.priceProjects = q("priceProjects");
    els.pricePositions = q("pricePositions");
    els.priceExtras = q("priceExtras");
    els.savePricesBtn = q("savePricesBtn");
    els.priceSaveNote = q("priceSaveNote");
    els.staffIdInput = q("staffIdInput");
    els.staffLevelInput = q("staffLevelInput");
    els.setLevelBtn = q("setLevelBtn");
    els.staffHint = q("staffHint");
    els.staffTbody = q("staffTbody");
  }

  function bindEvents() {
    els.tabs.forEach(function (b) {
      b.addEventListener("click", function () {
        var tab = b.getAttribute("data-tab");
        if (tab === "prices" && state.currentUser.level < 9) return;
        if (tab === "staff" && state.currentUser.level < 10) return;
        switchTab(tab);
      });
    });

    els.statusFilter.addEventListener("change", function () {
      state.statusFilter = els.statusFilter.value;
      renderOrders();
    });

    els.ordersTbody.addEventListener("click", handleOrderAction);
    els.savePricesBtn.addEventListener("click", savePrices);
    els.setLevelBtn.addEventListener("click", applyLevel);
  }

  async function init() {
    cacheEls();
    if (!(await guardAccess())) return;
    
    renderLevelInfo();
    bindEvents();
    await switchTab("orders");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
