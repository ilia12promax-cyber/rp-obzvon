(function () {
  "use strict";

  var KEYS = {
    users: "rp_users",
    orders: "rp_orders",
    prices: "rp_prices",
    session: "rp_session",
    seeded: "rp_seeded_v1"
  };

  var DEFAULT_PRICES = {
    projects: {
      black_russia: { name: "Black Russia", price: 4.5 },
      grand_mobile: { name: "Grand Mobile", price: 5.0 },
      matreshka_rp: { name: "Matreshka RP", price: 4.0 },
      arizona_rp: { name: "Arizona RP", price: 5.5 },
      other: { name: "Другой проект", price: 6.0 }
    },
    positions: {
      leader_gov: { name: "Лидер организации (ГОСС)", price: 9.0 },
      leader_opg: { name: "Лидер организации (ОПГ)", price: 10.0 },
      deputy: { name: "Заместитель лидера (9 ранг)", price: 7.0 },
      senior: { name: "Старший состав (7–8 ранг)", price: 5.5 },
      support: { name: "Агент поддержки / Хелпер", price: 4.0 },
      junior_admin: { name: "Младший администратор / Модератор", price: 6.5 }
    },
    extras: {
      cheat_sheet: { name: "Индивидуальная шпаргалка с ответами", price: 2.5 },
      trial_call: { name: "Пробный тестовый обзвон", price: 2.0 },
      urgent: { name: "Срочный заказ (15–30 минут)", price: 3.5 }
    }
  };

  var OWNER_ACCOUNT = {
    id: "10000",
    nick: "Owner",
    login: "owner",
    password: "owner10",
    level: 10,
    balance: 1000,
    avatar: null,
    createdAt: Date.now()
  };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function seedIfNeeded() {
    if (localStorage.getItem(KEYS.seeded) === "1") return;

    var users = readJSON(KEYS.users, []);
    var hasOwner = users.some(function (u) { return u.level === 10; });
    if (!hasOwner) {
      users.push(clone(OWNER_ACCOUNT));
      writeJSON(KEYS.users, users);
    }

    if (localStorage.getItem(KEYS.prices) === null) {
      writeJSON(KEYS.prices, clone(DEFAULT_PRICES));
    }

    if (localStorage.getItem(KEYS.orders) === null) {
      writeJSON(KEYS.orders, []);
    }

    localStorage.setItem(KEYS.seeded, "1");
  }

  function getUsers() {
    return readJSON(KEYS.users, []);
  }

  function saveUsers(users) {
    return writeJSON(KEYS.users, users);
  }

  function getUserById(id) {
    var users = getUsers();
    var idStr = String(id).replace(/^#/, "");
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].id) === idStr) return users[i];
    }
    return null;
  }

  function getUserByLogin(login) {
    var users = getUsers();
    var l = String(login || "").toLowerCase();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].login || "").toLowerCase() === l) return users[i];
    }
    return null;
  }

  function nextUserId() {
    var users = getUsers();
    var max = 10000;
    for (var i = 0; i < users.length; i++) {
      var n = parseInt(users[i].id, 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
  }

  function registerUser(login, password, nick) {
    login = String(login || "").trim();
    password = String(password || "");
    nick = String(nick || "").trim();

    if (login.length < 3) return { ok: false, error: "Логин минимум 3 символа" };
    if (password.length < 4) return { ok: false, error: "Пароль минимум 4 символа" };
    if (nick.length < 3) return { ok: false, error: "Ник минимум 3 символа" };
    if (nick.length > 24) return { ok: false, error: "Ник максимум 24 символа" };
    if (getUserByLogin(login)) return { ok: false, error: "Логин уже занят" };

    var users = getUsers();
    var user = {
      id: nextUserId(),
      nick: nick,
      login: login,
      password: password,
      level: 0,
      balance: 0,
      avatar: null,
      createdAt: Date.now()
    };
    users.push(user);
    saveUsers(users);
    return { ok: true, user: user };
  }

  function loginUser(login, password) {
    var user = getUserByLogin(login);
    if (!user) return { ok: false, error: "Пользователь не найден" };
    if (user.password !== String(password || "")) return { ok: false, error: "Неверный пароль" };
    return { ok: true, user: user };
  }

  function setSession(userId) {
    if (userId === null || userId === undefined) {
      localStorage.removeItem(KEYS.session);
      return;
    }
    writeJSON(KEYS.session, { userId: String(userId), at: Date.now() });
  }

  function getSession() {
    var s = readJSON(KEYS.session, null);
    if (!s || !s.userId) return null;
    var user = getUserById(s.userId);
    if (!user) {
      localStorage.removeItem(KEYS.session);
      return null;
    }
    return user;
  }

  function getCurrentUser() {
    return getSession();
  }

  function logout() {
    localStorage.removeItem(KEYS.session);
  }

  function updateUser(id, patch) {
    var users = getUsers();
    var idStr = String(id);
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].id) === idStr) {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) {
            users[i][k] = patch[k];
          }
        }
        saveUsers(users);
        return users[i];
      }
    }
    return null;
  }

  function changeCredentials(userId, newLogin, newPassword) {
    var user = getUserById(userId);
    if (!user) return { ok: false, error: "Пользователь не найден" };

    newLogin = String(newLogin || "").trim();
    newPassword = String(newPassword || "");

    if (newLogin.length < 3) return { ok: false, error: "Логин минимум 3 символа" };
    if (newPassword.length < 4) return { ok: false, error: "Пароль минимум 4 символа" };

    var existing = getUserByLogin(newLogin);
    if (existing && String(existing.id) !== String(user.id)) {
      return { ok: false, error: "Этот логин уже занят другим пользователем" };
    }

    updateUser(user.id, { login: newLogin, password: newPassword });
    return { ok: true };
  }

  function changeBalance(id, delta) {
    var user = getUserById(id);
    if (!user) return null;
    var newBalance = Math.round((Number(user.balance || 0) + Number(delta || 0)) * 100) / 100;
    if (newBalance < 0) return null;
    return updateUser(id, { balance: newBalance });
  }

  function getPrices() {
    var p = readJSON(KEYS.prices, null);
    if (!p) {
      p = clone(DEFAULT_PRICES);
      writeJSON(KEYS.prices, p);
    }
    return p;
  }

  function savePrices(prices) {
    return writeJSON(KEYS.prices, prices);
  }

  function resetPrices() {
    writeJSON(KEYS.prices, clone(DEFAULT_PRICES));
    return getPrices();
  }

  function getOrders() {
    return readJSON(KEYS.orders, []);
  }

  function saveOrders(orders) {
    return writeJSON(KEYS.orders, orders);
  }

  function nextOrderId() {
    var orders = getOrders();
    var max = 1000;
    for (var i = 0; i < orders.length; i++) {
      var n = parseInt(orders[i].id, 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
  }

  function createOrder(payload) {
    var user = getUserById(payload.userId);
    if (!user) return { ok: false, error: "Пользователь не найден" };
    var total = Number(payload.total) || 0;
    if (user.balance < total) return { ok: false, error: "Недостаточно средств" };

    var orders = getOrders();
    var order = {
      id: nextOrderId(),
      userId: String(user.id),
      userNick: user.nick,
      telegram: String(payload.telegram || ""),
      projectKey: payload.projectKey,
      projectName: payload.projectName,
      positionKey: payload.positionKey,
      positionName: payload.positionName,
      extras: payload.extras || [],
      total: total,
      status: "pending",
      assignedTo: null,
      assignedNick: null,
      createdAt: Date.now(),
      completedAt: null
    };
    orders.push(order);
    saveOrders(orders);
    changeBalance(user.id, -total);
    return { ok: true, order: order };
  }

  function updateOrder(id, patch) {
    var orders = getOrders();
    var idStr = String(id);
    for (var i = 0; i < orders.length; i++) {
      if (String(orders[i].id) === idStr) {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) {
            orders[i][k] = patch[k];
          }
        }
        saveOrders(orders);
        return orders[i];
      }
    }
    return null;
  }

  function claimOrder(orderId, admin) {
    var orders = getOrders();
    var idStr = String(orderId);
    for (var i = 0; i < orders.length; i++) {
      if (String(orders[i].id) === idStr) {
        if (orders[i].status !== "pending") {
          return { ok: false, error: "Заказ уже взят в работу" };
        }
        orders[i].status = "in_progress";
        orders[i].assignedTo = String(admin.id);
        orders[i].assignedNick = admin.nick;
        saveOrders(orders);
        return { ok: true, order: orders[i] };
      }
    }
    return { ok: false, error: "Заказ не найден" };
  }

  function completeOrder(orderId, admin) {
    var orders = getOrders();
    var idStr = String(orderId);
    for (var i = 0; i < orders.length; i++) {
      if (String(orders[i].id) === idStr) {
        if (orders[i].status === "done") {
          return { ok: false, error: "Заказ уже завершён" };
        }
        if (String(orders[i].assignedTo) !== String(admin.id)) {
          return { ok: false, error: "Заказ закреплён за другим администратором" };
        }
        orders[i].status = "done";
        orders[i].completedAt = Date.now();
        saveOrders(orders);
        return { ok: true, order: orders[i] };
      }
    }
    return { ok: false, error: "Заказ не найден" };
  }

  function setUserLevel(id, level) {
    var lvl = parseInt(level, 10);
    if (isNaN(lvl) || lvl < 0 || lvl > 10) {
      return { ok: false, error: "Уровень должен быть 0–10" };
    }
    var user = getUserById(id);
    if (!user) return { ok: false, error: "Пользователь с таким ID не найден" };
    if (user.level === 10 && lvl !== 10) {
      return { ok: false, error: "Нельзя снять уровень с Владельца" };
    }
    updateUser(user.id, { level: lvl });
    return { ok: true, user: getUserById(user.id) };
  }

  seedIfNeeded();

  window.AppStorage = {
    KEYS: KEYS,
    DEFAULT_PRICES: DEFAULT_PRICES,
    OWNER_ACCOUNT: OWNER_ACCOUNT,
    getUsers: getUsers,
    getUserById: getUserById,
    getUserByLogin: getUserByLogin,
    registerUser: registerUser,
    loginUser: loginUser,
    setSession: setSession,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    logout: logout,
    updateUser: updateUser,
    changeCredentials: changeCredentials,
    changeBalance: changeBalance,
    getPrices: getPrices,
    savePrices: savePrices,
    resetPrices: resetPrices,
    getOrders: getOrders,
    createOrder: createOrder,
    updateOrder: updateOrder,
    claimOrder: claimOrder,
    completeOrder: completeOrder,
    setUserLevel: setUserLevel
  };
})();