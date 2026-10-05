importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC7C55ykigI6PPJohUdd422p3UJn0NmNa8",
  authDomain: "maqsad-tomon.firebaseapp.com",
  projectId: "maqsad-tomon",
  storageBucket: "maqsad-tomon.firebasestorage.app",
  messagingSenderId: "131558530387",
  appId: "1:131558530387:web:45c4b99acbf7c04654d5a6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Namoz vaqti kirdi!";
  const options = {
    body: payload.notification?.body || "Namozni ado etish vaqti bo‘ldi.",
    icon: payload.notification?.icon || "https://cdn-icons-png.flaticon.com/512/2855/2855502.png",
    badge: "https://cdn-icons-png.flaticon.com/512/2855/2855502.png",
    vibrate: [200, 100, 200],
    tag: "prayer-reminder",
    renotify: true
  };
  self.registration.showNotification(title, options);
});
