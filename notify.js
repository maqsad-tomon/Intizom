const admin = require('firebase-admin');
const https = require('https');

// Telegramga xabar yuborish yordamchi funksiyasi
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve) => {
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

// Telegram getUpdates orqali "START" bosgan yangi foydalanuvchilarni avtomatik ulash
async function syncTelegramUsers(botToken, db) {
  if (!botToken) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await res.json();
    if (!data.ok || !data.result || data.result.length === 0) return;

    let maxUpdateId = 0;
    for (const update of data.result) {
      if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const parts = msg.text.trim().split(/\s+/);
      const chatId = String(msg.chat.id);

      if (parts[0] === '/start') {
        if (parts.length > 1 && parts[1]) {
          const uid = parts[1].trim();
          console.log(`🔗 Yangi foydalanuvchi avtomatik ulanmoqda: UID ${uid} -> Chat ID ${chatId}`);

          // Firestore bazasiga Chat ID ni avtomatik yozish
          await db.collection('intizom_users').doc(uid).set({
            telegramChatId: chatId,
            telegramUser: msg.from?.username || msg.from?.first_name || '',
            telegramConnectedAt: new Date().toISOString()
          }, { merge: true });

          // Foydalanuvchiga Telegramda tasdiq xabarini yuborish
          await sendTelegramMessage(botToken, chatId, `🎉 <b>Tabriklaymiz!</b>\n\nHisobingiz <b>"Intizom"</b> ilovasi bilan muvaffaqiyatli ulandi.\n\nEndi har bir namoz vaqti (Bomdod, Peshin, Asr, Shom, Xufton, Vitr) kirganida sizga mana shu bot orqali avtomatik eslatma yuborib turiladi! 🕌`);
        } else {
          await sendTelegramMessage(botToken, chatId, `Assalomu alaykum! 🕌\n\n<b>"Intizom"</b> ilovasi bilan hisobingizni ulash uchun, ilovadagi <b>"Telegram botga 1 bosishda ulanish"</b> tugmasini bosing.`);
        }
      }
    }

    // Qayta ishlanmasligi uchun navbatni tozalash
    if (maxUpdateId > 0) {
      await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${maxUpdateId + 1}`);
    }
  } catch (err) {
    console.error("⚠️ Telegram yangilanishlarini tekshirishda xatolik:", err.message);
  }
}

// 1. Firebase init
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
const WINDOW_MINUTES = 25; // 25 daqiqalik oyna

// Standart namoz vaqtlari
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
  // 1. Telegram botga yangi ulanishlarni avtomatik qabul qilish
  if (TELEGRAM_BOT_TOKEN) {
    await syncTelegramUsers(TELEGRAM_BOT_TOKEN, db);
  } else {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN topilmadi!");
  }

  // 2. Namoz vaqtlarini tekshirish
  const now = new Date();
  const uzbDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now);
  const uzbHoursStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: 'numeric', hour12: false }).format(now);
  const uzbMinStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', minute: 'numeric' }).format(now);

  const uzbHours = parseInt(uzbHoursStr, 10);
  const uzbMinutes = parseInt(uzbMinStr, 10);
  const currentTotalMinutes = uzbHours * 60 + uzbMinutes;

  console.log(`⏰ Toshkent vaqti: ${uzbDate} ${String(uzbHours).padStart(2, '0')}:${String(uzbMinutes).padStart(2, '0')} (${currentTotalMinutes}-daq)`);

  const usersSnap = await db.collection('intizom_users').get();
  console.log(`👥 Jami foydalanuvchilar: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const telegramChatId = data.telegramChatId || data.chatId || null;
    const times = { ...DEFAULT_TIMES, ...(data.prayerTimes || data.namozVaqtlari || {}) };
    const lastSent = data.lastSent || {};

    if (!telegramChatId && !data.fcmToken) {
      continue;
    }

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];
      if (!pTime || !pTime.includes(':')) continue;

      if (lastSent[key] === uzbDate) continue;

      const [pHour, pMin] = pTime.trim().split(':').map(Number);
      if (isNaN(pHour) || isNaN(pMin)) continue;

      const targetMinutes = pHour * 60 + pMin;
      const diff = (currentTotalMinutes - targetMinutes + 1440) % 1440;

      if (diff >= 0 && diff < WINDOW_MINUTES) {
        console.log(`🚀 ${prayerName} (${pTime}) vaqti kirdi! Telegramga yuborilmoqda...`);

        const text = `🕌 <b>${prayerName} vaqti kirdi!</b>\n\nNamoz vaqti bo‘ldi (${pTime}). Ado etishni unutmang!`;
        let sent = false;

        if (TELEGRAM_BOT_TOKEN && telegramChatId) {
          sent = await sendTelegramMessage(TELEGRAM_BOT_TOKEN, telegramChatId, text);
        }

        if (data.fcmToken) {
          try {
            await admin.messaging().send({
              token: data.fcmToken,
              notification: { title: `🕌 ${prayerName} vaqti kirdi!`, body: `Namoz vaqti bo‘ldi (${pTime}).` },
              data: { title: `🕌 ${prayerName} vaqti kirdi!`, body: `Namoz vaqti bo‘ldi (${pTime}).`, prayer: key }
            });
            sent = true;
          } catch (e) {}
        }

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
    console.log("🏁 Tekshiruv yakunlandi.");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Xatolik:", err);
    process.exit(1);
  });
