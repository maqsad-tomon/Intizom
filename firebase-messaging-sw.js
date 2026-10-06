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
  console.log('[SW] Orqa fonda xabar keldi:', payload);

  // Agar tizim (Apple APNs) o'zi bildirishnomani ko'rsatgan bo'lsa, qayta chiqarmaymiz
  if (payload.notification) {
    return;
  }

  const title = (payload.data && payload.data.title) || 'Namoz vaqti kirdi!';
  const options = {
    body: (payload.data && payload.data.body) || 'Ado etishni unutmang!',
    icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
    tag: 'prayer-notification',
    renotify: true,
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});
