const admin = require('firebase-admin');
const https = require('https');

// Telegram bot orqali xabar yuborish funksiyasi
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    if (!botToken || !chatId) return resolve(false);

    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            console.log(`✈️ Telegram xabari yetkazildi: ${chatId}`);
            resolve(true);
          } else {
            console.error(`⚠️ Telegram xatolik:`, json.description);
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`⚠️ Telegram so'rov xatosi:`, err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// 1. Firebase Service Account tekshiruvi
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Xatolik: FIREBASE_SERVICE_ACCOUNT muhit o'zgaruvchisi topilmadi!");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
} catch (e) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT JSON xato:", e.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
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
  const uzbDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now);
  const uzbHoursStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: 'numeric', hour12: false }).format(now);
  const uzbMinStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', minute: 'numeric' }).format(now);

  const uzbHours = parseInt(uzbHoursStr, 10);
  const uzbMinutes = parseInt(uzbMinStr, 10);
  const currentTotalMinutes = uzbHours * 60 + uzbMinutes;

  console.log(`⏰ Hozirgi Toshkent vaqti: ${uzbDate} ${String(uzbHours).padStart(2, '0')}:${String(uzbMinutes).padStart(2, '0')} (${currentTotalMinutes}-daq)`);

  const usersSnap = await db.collection('intizom_users').get();
  console.log(`👥 Foydalanuvchilar soni: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();

    const tokenField = TOKEN_FIELDS.find(f => data[f]);
    const fcmToken = tokenField ? data[tokenField] : null;
    const telegramChatId = data.telegramChatId || data.chatId || null;
    const times = data.prayerTimes || data.namozVaqtlari || {};
    const lastSent = data.lastSent || {};

    // Agar na FCM token va na Telegram ID bo'lmasa, o'tkazamiz
    if (!fcmToken && !telegramChatId) {
      continue;
    }

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];
      if (!pTime || typeof pTime !== 'string' || !pTime.includes(':')) continue;

      if (lastSent[key] === uzbDate) continue;

      const [pHour, pMin] = pTime.trim().split(':').map(Number);
      if (isNaN(pHour) || isNaN(pMin)) continue;

      const targetMinutes = pHour * 60 + pMin;
      const diff = (currentTotalMinutes - targetMinutes + 1440) % 1440;

      if (diff >= 0 && diff < WINDOW_MINUTES) {
        console.log(`🚀 ${doc.id}: ${prayerName} (${pTime}) yuborilmoqda...`);

        const title = `🕌 ${prayerName} vaqti kirdi!`;
        const body = `Namoz vaqti bo‘ldi (${pTime}). Ado etishni unutmang!`;

        let sentSuccess = false;

        // 1. Telegram orqali xabar yuborish
        if (TELEGRAM_BOT_TOKEN && telegramChatId) {
          const tgText = `<b>${title}</b>\n\n${body}`;
          sentSuccess = await sendTelegramMessage(TELEGRAM_BOT_TOKEN, telegramChatId, tgText);
        }

        // 2. Web Push (FCM) orqali xabar yuborish
        if (fcmToken) {
          const message = {
            token: fcmToken,
            notification: { title, body },
            data: { title, body, prayer: key, tag: `namoz-${key}`, url: './' },
            android: { priority: 'high', ttl: 15 * 60 * 1000 },
            webpush: { headers: { Urgency: 'high', TTL: '900' } }
          };
          try {
            await admin.messaging().send(message);
            sentSuccess = true;
          } catch (err) {
            console.error(`⚠️ FCM xatolik:`, err.message);
          }
        }

        // Agar xabar muvaffaqiyatli yuborilgan bo'lsa, bazaga belgilaymiz
        if (sentSuccess) {
          await doc.ref.set({
            lastSent: {
              ...lastSent,
              [key]: uzbDate
            }
          }, { merge: true });
        }
      }
    }
  }
}

checkAndSend()
  .then(() => {
    console.log("🏁 Tekshiruv yakunlandi.");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Xatolik:", err);
    process.exit(1);
  });
