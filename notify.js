
const admin = require('firebase-admin');

// 1. Muhit o'zgaruvchisi (Secret) mavjudligini tekshirish
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Xatolik: FIREBASE_SERVICE_ACCOUNT muhit o'zgaruvchisi topilmadi!");
  process.exit(1);
}

// 2. Service account JSON kalitini xavfsiz o'qish (GitHub Secrets'dagi qator buzilishlarini to'g'irlaydi)
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
} catch (e) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT JSON formati noto'g'ri:", e.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// GitHub Actions cron kechikishlarini hisobga olgan holda tekshirish oynasi (daqiqa)
const WINDOW_MINUTES = 20;

const prayerNames = {
  bomdod: "Bomdod",
  peshin: "Peshin",
  asr: "Asr",
  shom: "Shom",
  xufton: "Xufton",
  vitr: "Vitr vojib"
};

const TOKEN_FIELDS = ['fcmToken', 'token', 'pushToken', 'deviceToken', 'fcm_token'];

async function checkAndSend() {
  const now = new Date();

  // O'zbekiston / Toshkent vaqtini aniq hisoblash (UTC+5)
  const uzbDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now); // YYYY-MM-DD
  const uzbHoursStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: 'numeric', hour12: false }).format(now);
  const uzbMinStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', minute: 'numeric' }).format(now);

  const uzbHours = parseInt(uzbHoursStr, 10);
  const uzbMinutes = parseInt(uzbMinStr, 10);
  const currentTotalMinutes = uzbHours * 60 + uzbMinutes;

  console.log(`⏰ Hozirgi Toshkent vaqti: ${uzbDate} ${String(uzbHours).padStart(2, '0')}:${String(uzbMinutes).padStart(2, '0')} (${currentTotalMinutes}-daqiqa)`);

  const usersSnap = await db.collection('intizom_users').get();
  console.log(`👥 Foydalanuvchilar soni: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();

    const tokenField = TOKEN_FIELDS.find(f => data[f]);
    const token = tokenField ? data[tokenField] : null;
    const times = data.prayerTimes || data.namozVaqtlari || {};
    const lastSent = data.lastSent || {};

    if (!token) {
      continue;
    }

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];
      if (!pTime || typeof pTime !== 'string' || !pTime.includes(':')) continue;

      // Bugun allaqachon yuborilgan bo'lsa, qayta yubormaymiz
      if (lastSent[key] === uzbDate) continue;

      const [pHour, pMin] = pTime.trim().split(':').map(Number);
      if (isNaN(pHour) || isNaN(pMin)) continue;

      const targetMinutes = pHour * 60 + pMin;
      // Kun almashishini (yarim tunni) hisobga oladi
      const diff = (currentTotalMinutes - targetMinutes + 1440) % 1440;

      // Agar hozirgi vaqt namoz vaqtidan keyin 0 dan 20 daqiqagacha oraliqda bo'lsa
      if (diff >= 0 && diff < WINDOW_MINUTES) {
        console.log(`🚀 ${doc.id}: ${prayerName} (${pTime}) xabarnomasi yuborilmoqda...`);

        const title = `${prayerName} vaqti kirdi!`;
        const body = `${prayerName} namozi vaqti bo‘ldi. Ado etishni unutmang!`;

        const message = {
          token,
          notification: { title, body },
          data: {
            title,
            body,
            prayer: key,
            tag: `namoz-${key}`,
            url: '/'
          },
          android: {
            priority: 'high',
            ttl: 15 * 60 * 1000,
            notification: {
              sound: 'default',
              priority: 'high'
            }
          },
          webpush: {
            headers: { Urgency: 'high', TTL: '900' },
            notification: {
              title,
              body,
              icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855502.png',
              tag: `namoz-${key}`
            }
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'alert'
            },
            payload: {
              aps: {
                alert: { title, body },
                sound: 'default',
                badge: 1,
                'interruption-level': 'time-sensitive'
              }
            }
          }
        };

        try {
          await admin.messaging().send(message);
          console.log(`✅ Yetkazildi: ${prayerName}`);

          // Yuborilganlik holatini bazada bugungi sana bilan belgilash
          await doc.ref.set({
            lastSent: {
              ...lastSent,
              [key]: uzbDate
            }
          }, { merge: true });
        } catch (err) {
          console.error(`⚠️ ${doc.id} yuborishda xatolik [${err.code}]:`, err.message);

          // Eskirgan / yaroqsiz tokenni avtomatik tozalash
          if (
            err.code === 'messaging/registration-token-not-registered' ||
            err.code === 'messaging/invalid-registration-token'
          ) {
            await doc.ref.update({ [tokenField]: admin.firestore.FieldValue.delete() });
            console.log(`🗑 Yaroqsiz token bazadan o'chirildi`);
            break;
          }
        }
      }
    }
  }
}

checkAndSend()
  .then(() => {
    console.log("🏁 Tekshiruv muvaffaqiyatli yakunlandi.");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Kutilmagan xatolik:", err);
    process.exit(1);
  });
