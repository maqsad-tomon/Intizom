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
  console.log('[SW] Xabar keldi:', payload);

  // Server data-only yuborsa, har doim o'zimiz ko'rsatamiz
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'Namoz vaqti kirdi!', {
    body: d.body || 'Ado etishni unutmang!',
    icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
    tag: d.tag || 'prayer-notification',
    renotify: true,
    data: { url: d.url || '/' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    })
  );
});
