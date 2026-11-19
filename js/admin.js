(function () {
  "use strict";

  if (!window.AppStorage) {
    return;
  }

  var S = window.AppStorage;

  var state = {
    currentUser: null,
    activeTab: "orders",
    statusFilter: "all"
  };

  var els = {};

  function q(id) {
    return document.getElementById(id);
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
    els.resetPricesBtn = q("resetPricesBtn");
    els.priceSaveNote = q("priceSaveNote");
    els.staffIdInput = q("staffIdInput");
    els.staffLevelInput = q("staffLevelInput");
    els.setLevelBtn = q("setLevelBtn");
    els.staffHint = q("staffHint");
    els.staffTbody = q("staffTbody");
  }

  function esc(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg, type) {
    if (window.showToast) {
      window.showToast(msg, type);
      return;
    }
    var div = document.createElement("div");
    div.className = "toast toast-" + (type || "success");
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(function () { div.remove(); }, 3000);
  }

  function formatMoney(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2) + " USDT";
  }

  function formatDate(ms) {
    if (!ms) return "—";
    var d = new Date(ms);
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return dd + "." + mm + " " + hh + ":" + mi;
  }

  function guardAccess() {
    var user = S.getCurrentUser();
    if (!user || user.level < 1) {
      window.location.href = "index.html";
      return false;
    }
    state.currentUser = user;
    return true;
  }

  function renderLevelInfo() {
    var u = state.currentUser;
    els.adminLevelInfo.textContent = "Уровень доступа: " + u.level + " · " + u.nick + " · ID #" + u.id;
    if (u.level >= 9) els.tabPricesBtn.hidden = false;
    if (u.level >= 10) els.tabStaffBtn.hidden = false;
  }

  function statusBadge(status, assignedNick) {
    if (status === "pending") {
      return '<span class="status-badge status-pending">Ожидает</span>';
    }
    if (status === "in_progress") {
      return '<span class="status-badge status-progress">В работе у ' + esc(assignedNick || "—") + "</span>";
    }
    return '<span class="status-badge status-done">Завершён</span>';
  }

  function renderOrders() {
    var orders = S.getOrders();
    var filter = state.statusFilter;
    var visible = orders.filter(function (o) {
      if (filter === "all") return true;
      return o.status === filter;
    });
    visible.sort(function (a, b) { return b.createdAt - a.createdAt; });

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

      var extrasText = (o.extras || []).map(function (e) { return esc(e.name || e); }).join(", ") || "—";

      var canClaim = o.status === "pending";
      var canComplete = o.status === "in_progress" && String(o.assignedTo) === String(me.id);
      var canContact = o.status === "in_progress" || o.status === "done";

      var actions = "";
      if (canClaim) {
        actions += '<button class="btn btn-primary btn-sm" data-action="claim" data-id="' + esc(o.id) + '">Взять в работу</button> ';
      }
        if (canContact) {
        var tgLink = "https://t.me/" + String(o.telegram || "").replace("@", "").trim();
        if (!o.telegram || tgLink === "https://t.me/") {
           tgLink = "https://t.me";
        }
        actions += '<a class="btn btn-outline btn-sm" href="' + tgLink + '" target="_blank" rel="noopener">Связаться</a> ';
      }
      if (canComplete) {
        actions += '<button class="btn btn-success btn-sm" data-action="complete" data-id="' + esc(o.id) + '">Завершить</button>';
      }
      if (!actions) actions = "—";

      tr.innerHTML =
        "<td>#" + esc(o.id) + "</td>" +
        "<td>" + esc(o.userNick) + "</td>" +
        "<td>" + esc(o.userId) + "</td>" +
        "<td>" + esc(o.telegram || "—") + "</td>" +
        "<td>" + esc(o.projectName) + "</td>" +
        "<td>" + esc(o.positionName) + "</td>" +
        "<td>" + extrasText + "</td>" +
        "<td>" + formatMoney(o.total) + "</td>" +
        "<td>" + statusBadge(o.status, o.assignedNick) + "</td>" +
        "<td>" + actions + "</td>";

      frag.appendChild(tr);
    });

    els.ordersTbody.appendChild(frag);
  }

  function handleOrderAction(ev) {
    var btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");

    if (action === "claim") {
      var res = S.claimOrder(id, state.currentUser);
      if (!res.ok) {
        toast(res.error, "error");
        renderOrders();
        return;
      }
      toast("Заказ #" + id + " закреплён за вами");
      renderOrders();
      return;
    }

    if (action === "complete") {
      var res2 = S.completeOrder(id, state.currentUser);
      if (!res2.ok) {
        toast(res2.error, "error");
        renderOrders();
        return;
      }
      toast("Заказ #" + id + " завершён");
      renderOrders();
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

  function renderPrices() {
    var prices = S.getPrices();
    renderPriceGroup(els.priceProjects, "projects", prices.projects);
    renderPriceGroup(els.pricePositions, "positions", prices.positions);
    renderPriceGroup(els.priceExtras, "extras", prices.extras);
  }

  function savePrices() {
    var prices = S.getPrices();
    var inputs = document.querySelectorAll(".price-row input[data-group]");
    var invalid = false;

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
      if (prices[group] && prices[group][key]) {
        prices[group][key].price = Math.round(val * 100) / 100;
      }
    });

    if (invalid) {
      toast("Проверьте цены: отрицательные и пустые значения недопустимы", "error");
      return;
    }

    S.savePrices(prices);
    els.priceSaveNote.hidden = false;
    setTimeout(function () { els.priceSaveNote.hidden = true; }, 2000);
    toast("Цены сохранены");
  }

  function resetPrices() {
    S.resetPrices();
    renderPrices();
    toast("Цены сброшены к заводским");
  }

  function renderStaff() {
    var users = S.getUsers().slice().sort(function (a, b) {
      return Number(b.level) - Number(a.level) || Number(a.id) - Number(b.id);
    });
    els.staffTbody.innerHTML = "";
    users.forEach(function (u) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>#" + esc(u.id) + "</td>" +
        "<td>" + esc(u.nick) + "</td>" +
        "<td>" + esc(u.level) + "</td>" +
        "<td>" + formatMoney(u.balance) + "</td>";
      els.staffTbody.appendChild(tr);
    });
  }

  function applyLevel() {
    var id = (els.staffIdInput.value || "").trim().replace(/^#/, "");
    var level = parseInt(els.staffLevelInput.value, 10);
    els.staffHint.hidden = true;
    els.staffIdInput.classList.remove("input-error");

    if (!id) {
      els.staffHint.textContent = "Введите ID пользователя";
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
      els.staffIdInput.classList.add("input-error");
      return;
    }
    if (isNaN(level) || level < 0 || level > 10) {
      els.staffHint.textContent = "Уровень должен быть 0–10";
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
      return;
    }

    var res = S.setUserLevel(id, level);
    if (!res.ok) {
      els.staffHint.textContent = res.error;
      els.staffHint.className = "field-hint field-hint-error";
      els.staffHint.hidden = false;
      return;
    }

    els.staffHint.textContent = "Пользователь #" + res.user.id + " (" + res.user.nick + ") — уровень " + res.user.level;
    els.staffHint.className = "field-hint field-hint-success";
    els.staffHint.hidden = false;
    els.staffIdInput.value = "";
    renderStaff();
    toast("Уровень обновлён");
  }

  function switchTab(tab) {
    state.activeTab = tab;
    els.tabs.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    els.panelOrders.hidden = tab !== "orders";
    els.panelPrices.hidden = tab !== "prices";
    els.panelStaff.hidden = tab !== "staff";

    if (tab === "orders") renderOrders();
    if (tab === "prices") renderPrices();
    if (tab === "staff") renderStaff();
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
    els.resetPricesBtn.addEventListener("click", resetPrices);
    els.setLevelBtn.addEventListener("click", applyLevel);

    window.addEventListener("storage", function (e) {
      if (e.key === S.KEYS.orders && state.activeTab === "orders") renderOrders();
      if (e.key === S.KEYS.users && state.activeTab === "staff") renderStaff();
    });
  }

  function init() {
    if (!guardAccess()) return;
    cacheEls();
    renderLevelInfo();
    bindEvents();
    switchTab("orders");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();