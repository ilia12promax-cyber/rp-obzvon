(function () {
  "use strict";

  var API_URL = "/api";
  var CURRENT_USER_KEY = "rp_current_user"; // Тут храним только ID пользователя для сессии

  function getCurrentUserId() {
    return localStorage.getItem(CURRENT_USER_KEY);
  }

  function setCurrentUserId(id) {
    if (id) {
      localStorage.setItem(CURRENT_USER_KEY, String(id));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  }

  function apiCall(endpoint, method, body) {
    var options = {
      method: method || "GET",
      headers: { "Content-Type": "application/json" }
    };
    if (body) options.body = JSON.stringify(body);

    return fetch(API_URL + endpoint, options)
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Ошибка сервера");
          return data;
        });
      });
  }

  window.AppStorage = {
    // Сессия
    getCurrentUserId: getCurrentUserId,
    setCurrentUserId: setCurrentUserId,
    logout: function () { setCurrentUserId(null); },

    // Авторизация
    registerUser: function (login, password, nick) {
      return apiCall("/register", "POST", { login: login, password: password, nick: nick });
    },
    loginUser: function (login, password) {
      return apiCall("/login", "POST", { login: login, password: password });
    },
    
    // Получение текущего пользователя (нужно для шапки)
    // Так как у нас нет мгновенного доступа к базе, мы возвращаем заглушку,
    // а реальные данные подтягиваются в common.js асинхронно.
    getCurrentUser: function() {
       return null; // Временная заглушка, будет перезаписана в common.js
    },

    // Обновление профиля
    updateProfile: function (userId, data) {
      return apiCall("/update-profile", "POST", Object.assign({ userId: userId }, data));
    },

    // Работа с ценами
    getPrices: function () {
      return apiCall("/prices", "GET");
    },
    savePrices: function (prices) {
      return apiCall("/prices", "POST", { prices: prices });
    },

    // Работа с заказами
    createOrder: function (payload) {
      return apiCall("/orders", "POST", payload);
    },
    getOrders: function (userId, isAdmin) {
      var url = "/orders/" + (userId || 0);
      if (isAdmin) url += "?isAdmin=true";
      return apiCall(url, "GET");
    },
    claimOrder: function (orderId, adminId) {
      return apiCall("/orders/claim", "POST", { orderId: orderId, adminId: adminId });
    },
    completeOrder: function (orderId, adminId) {
      return apiCall("/orders/complete", "POST", { orderId: orderId, adminId: adminId });
    },

    // Работа с персоналом
    getUsers: function () {
      return apiCall("/users", "GET");
    },
    setUserLevel: function (userId, level) {
      return apiCall("/users/level", "POST", { userId: userId, level: level });
    }
  };
})();
