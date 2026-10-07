const admin = require('firebase-admin');
const https = require('https');

// Telegramga xabar yuborish
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve) => {
    if (!botToken) {
      console.error("❌ Xatolik: TELEGRAM_BOT_TOKEN kiritilmagan!");
      return resolve(false);
    }
    if (!chatId) {
      console.error("❌ Xatolik: Foydalanuvchida telegramChatId yo'q!");
      return resolve(false);
    }

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
            console.log(`✈️ TELEGRAMGA YUBORILDI! Chat ID: ${chatId}`);
            resolve(true);
          } else {
            console.error(`⚠️ Telegram xatolik [${json.error_code}]:`, json.description);
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`⚠️ Telegram ulanish xatosi:`, err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Xatolik: FIREBASE_SERVICE_ACCOUNT topilmadi!");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
} catch (e) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT JSON formati xato:", e.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WINDOW_MINUTES = 25; // 25 daqiqalik qamrov oynasi

// Standart namoz vaqtlari (agar bazada bo'sh bo'lsa)
const DEFAULT_TIMES = {
  bomdod: "05:15",
  peshin: "12:40",
  asr: "16:25",
  shom: "18:20",
  xufton: "19:50",
  vitr: "20:15"
};

const prayerNames = {
  bomdod: "Bomdod",
  peshin: "Peshin",
  asr: "Asr",
  shom: "Shom",
  xufton: "Xufton",
  vitr: "Vitr vojib"
};

async function checkAndSend() {
  const now = new Date();
  const uzbDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now);
  const uzbHoursStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: 'numeric', hour12: false }).format(now);
  const uzbMinStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', minute: 'numeric' }).format(now);

  const uzbHours = parseInt(uzbHoursStr, 10);
  const uzbMinutes = parseInt(uzbMinStr, 10);
  const currentTotalMinutes = uzbHours * 60 + uzbMinutes;

  console.log(`⏰ Toshkent vaqti: ${uzbDate} ${String(uzbHours).padStart(2, '0')}:${String(uzbMinutes).padStart(2, '0')}`);

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("⚠️ OGOHLANTIRISH: TELEGRAM_BOT_TOKEN siri topilmadi!");
  }

  const usersSnap = await db.collection('intizom_users').get();
  console.log(`👥 Jami foydalanuvchilar: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const telegramChatId = data.telegramChatId || data.chatId || null;
    const times = { ...DEFAULT_TIMES, ...(data.prayerTimes || data.namozVaqtlari || {}) };
    const lastSent = data.lastSent || {};

    console.log(`\n👤 Foydalanuvchi: ${doc.id}`);
    console.log(`   - Telegram Chat ID: ${telegramChatId ? telegramChatId : "YO'Q ❌"}`);
    console.log(`   - Xufton vaqti: ${times.xufton}`);

    if (!telegramChatId && !data.fcmToken) {
      console.log(`   ⏭ O'tkazib yuborildi (Token ham, Telegram ID ham yo'q)`);
      continue;
    }

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];
      if (!pTime || !pTime.includes(':')) continue;

      if (lastSent[key] === uzbDate) {
        continue;
      }

      const [pHour, pMin] = pTime.trim().split(':').map(Number);
      if (isNaN(pHour) || isNaN(pMin)) continue;

      const targetMinutes = pHour * 60 + pMin;
      const diff = (currentTotalMinutes - targetMinutes + 1440) % 1440;

      // Namoz vaqti kirdi (0 dan 25 daqiqagacha bo'lgan vaqt oralig'i)
      if (diff >= 0 && diff < WINDOW_MINUTES) {
        console.log(`🚀 ${prayerName} (${pTime}) vaqti kirdi! Telegramga yuborilmoqda...`);

        const text = `🕌 <b>${prayerName} vaqti kirdi!</b>\n\nNamoz vaqti bo‘ldi (${pTime}). Ado etishni unutmang!`;
        const sent = await sendTelegramMessage(TELEGRAM_BOT_TOKEN, telegramChatId, text);

        if (sent) {
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
    console.log("\n🏁 Tekshiruv yakunlandi.");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Xatolik:", err);
    process.exit(1);
  });
