importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// 1. Firebase loyihangiz sozlamalari
firebase.initializeApp({
  apiKey: "AIzaSyC7C55ykigI6PPJohUdd422p3UJn0NmNa8",
  authDomain: "maqsad-tomon.firebaseapp.com",
  projectId: "maqsad-tomon",
  storageBucket: "maqsad-tomon.firebasestorage.app",
  messagingSenderId: "131558530387",
  appId: "1:131558530387:web:45c4b99acbf7c04654d5a6"
});

const messaging = firebase.messaging();

// 2. Ilova yopiq (fonda) paytda xabarni qabul qilish
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Xabar keldi:', payload);

  // Agar Firebase brauzer orqali avtomatik xabar chiqarayotgan bo'lsa,
  // 2 marta dublikat bo'lmasligi uchun to'xtatamiz
  if (payload.notification) {
    return;
  }

  const d = payload.data || {};
  const title = d.title || 'Namoz vaqti kirdi!';
  const body = d.body || 'Ado etishni unutmang!';

  return self.registration.showNotification(title, {
    body: body,
    icon: d.icon || 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
    tag: d.tag || 'prayer-notification',
    renotify: true,
    data: { url: d.url || './' }
  });
});

// 3. Bildirishnoma ustiga bosilganda GitHub Pages saytingizni ochish
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url) || './';
  const targetUrl = new URL(rawUrl, self.registration.scope).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
