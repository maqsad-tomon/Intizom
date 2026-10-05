const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAndSend() {
  // Toshkent vaqti bo'yicha soat va daqiqa (UTC+5)
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const uzbMinutes = (utcMinutes + 5 * 60) % (24 * 60);

  const uzbHour = Math.floor(uzbMinutes / 60);
  const uzbMin = uzbMinutes % 60;
  const currentTime = `${String(uzbHour).padStart(2, '0')}:${String(uzbMin).padStart(2, '0')}`;

  console.log("Hozirgi vaqt (O'zbekiston):", currentTime);

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
            webpush: {
              notification: {
                icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png'
              }
            }
          });
          console.log(`Muvaffaqiyatli yuborildi: ${prayerName}`);
        } catch (err) {
          console.error(`Yuborishda xato:`, err.message);
        }
      }
    }
  }
}

checkAndSend().catch(console.error);
