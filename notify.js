const admin = require('firebase-admin');

// GitHub Secret orqali keladigan Firebase Service Account kalitini o'qish
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAndSend() {
  // O'zbekiston vaqti bo'yicha aniq soat va daqiqa (UTC+5)
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const uzbMinutes = (utcMinutes + 5 * 60) % (24 * 60);

  const uzbHour = Math.floor(uzbMinutes / 60);
  const uzbMin = uzbMinutes % 60;
  const currentTime = `${String(uzbHour).padStart(2, '0')}:${String(uzbMin).padStart(2, '0')}`;

  console.log("Hozirgi vaqt (O'zbekiston):", currentTime);

  // Firestore'dagi barcha foydalanuvchilarni olish
  const usersSnap = await db.collection('intizom_users').get();

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const token = data.fcmToken;
    const times = data.prayerTimes || {};

    if (!token) continue;

    const prayerNames = {
      bomdod: "Bomdod",
      peshin: "Peshin",
      asr: "Asr",
      shom: "Shom",
      xufton: "Xufton",
      vitr: "Vitr vojib"
    };

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];

      if (pTime === currentTime) {
        console.log(`Foydalanuvchiga yuborilmoqda: ${prayerName}`);

        try {
          await admin.messaging().send({
            token: token,
            notification: {
              title: `${prayerName} vaqti kirdi!`,
              body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`
            },
            // Android va kompyuter brauzerlari uchun sozlamalar:
            webpush: {
              headers: {
                Urgency: 'high'
              },
              notification: {
                title: `${prayerName} vaqti kirdi!`,
                body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`,
                icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
                sound: 'default',
                requireInteraction: true
              }
            },
            // Apple (iOS / iPhone) Safari PWA tizimi uchun ovoz va ustuvorlik sozlamalari:
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert'
              },
              payload: {
                aps: {
                  alert: {
                    title: `${prayerName} vaqti kirdi!`,
                    body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`
                  },
                  sound: 'default',
                  badge: 1
                }
              }
            }
          });
          console.log(`Muvaffaqiyatli yuborildi (ovozli rejimda): ${prayerName}`);
        } catch (err) {
          console.error(`Yuborishda xato yuz berdi:`, err.message);
        }
      }
    }
  }
}

checkAndSend().catch(console.error);
