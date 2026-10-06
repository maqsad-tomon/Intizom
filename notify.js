const admin = require('firebase-admin');

// GitHub Secret'dan olingan Firebase kaliti
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAndSend() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const uzbMinutes = (utcMinutes + 5 * 60) % (24 * 60);

  const uzbHour = Math.floor(uzbMinutes / 60);
  const uzbMin = uzbMinutes % 60;
  const currentTime = `${String(uzbHour).padStart(2, '0')}:${String(uzbMin).padStart(2, '0')}`;
  
  console.log(`========================================`);
  console.log(`Hozirgi vaqt (O'zbekiston): ${currentTime} (${uzbMinutes}-daqiqa)`);
  console.log(`========================================`);

  // Barcha foydalanuvchilarni olamiz
  const usersSnap = await db.collection('intizom_users').get();
  console.log(`Bazadagi jami foydalanuvchilar soni: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    console.log(`\nFoydalanuvchi ID: ${doc.id}`);
    console.log(`Hujjat ichidagi kalitlar:`, Object.keys(data));

    // Token qaysi nom bilan saqlangan bo'lsa ham ushlaymiz
    const token = data.fcmToken || data.token || data.pushToken || data.deviceToken || data.fcm_token;
    const times = data.prayerTimes || data.namozVaqtlari || {};

    if (!token) {
      console.log(`❌ Bu foydalanuvchida FCM token topilmadi!`);
      continue;
    } else {
      console.log(`✅ Token topildi: ${token.substring(0, 15)}...`);
    }

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
      if (!pTime || !pTime.includes(':')) continue;

      const [pHour, pMin] = pTime.split(':').map(Number);
      const targetMinutes = pHour * 60 + pMin;
      const diff = uzbMinutes - targetMinutes;

      // Agar namoz vaqti so'nggi 5 daqiqa ichida kirgan bo'lsa
      if (diff >= 0 && diff < 5) {
        console.log(`🚀 Xabar yuborilmoqda: ${prayerName} (${pTime})`);

        try {
          await admin.messaging().send({
            token: token,
            notification: {
              title: `${prayerName} vaqti kirdi!`,
              body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`
            },
            webpush: {
              headers: {
                Urgency: 'high'
              },
              notification: {
                title: `${prayerName} vaqti kirdi!`,
                body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`,
                icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
                sound: 'default'
              }
            },
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
                  badge: 1,
                  'interruption-level': 'time-sensitive'
                }
              }
            }
          });
          console.log(`🎉 Muvaffaqiyatli yetkazildi: ${prayerName}`);
        } catch (err) {
          console.error(`⚠️ Yuborishda xatolik:`, err.message);
        }
      }
    }
  }
}

checkAndSend().catch(console.error);
