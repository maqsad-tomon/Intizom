const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const WINDOW_MINUTES = 15; // GitHub cron kechikishi uchun

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
  const uzbNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const today = uzbNow.toISOString().slice(0, 10);
  const uzbMinutes = uzbNow.getUTCHours() * 60 + uzbNow.getUTCMinutes();

  console.log(`Hozirgi vaqt (UZ): ${uzbNow.toISOString()} | ${uzbMinutes}-daqiqa`);

  const usersSnap = await db.collection('intizom_users').get();
  console.log(`Foydalanuvchilar soni: ${usersSnap.docs.length}`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const tokenField = TOKEN_FIELDS.find(f => data[f]);
    const token = tokenField ? data[tokenField] : null;
    const times = data.prayerTimes || data.namozVaqtlari || {};
    const lastSent = data.lastSent || {};

    if (!token) {
      console.log(`❌ ${doc.id}: token yo'q`);
      continue;
    }
    console.log(`✅ ${doc.id}: token bor, vaqtlar: ${JSON.stringify(times)}`);

    for (const [key, prayerName] of Object.entries(prayerNames)) {
      const pTime = times[key];
      if (!pTime || typeof pTime !== 'string' || !pTime.includes(':')) continue;
      if (lastSent[key] === today) continue;

      const [pHour, pMin] = pTime.trim().split(':').map(Number);
      if (isNaN(pHour) || isNaN(pMin)) continue;

      const diff = (uzbMinutes - (pHour * 60 + pMin) + 1440) % 1440;

      if (diff < WINDOW_MINUTES) {
        console.log(`🚀 ${doc.id}: ${prayerName} (${pTime}) yuborilmoqda`);

        const message = {
          token,
          data: {
            title: `${prayerName} vaqti kirdi!`,
            body: `Namoz vaqti bo‘ldi. Ado etishni unutmang!`,
            tag: `prayer-${key}`,
            url: './',
            prayerId: key
          },
          webpush: {
            headers: { Urgency: 'high', TTL: '600' }
          }
        };

        try {
          await admin.messaging().send(message);
          console.log(`🎉 Yetkazildi: ${prayerName}`);
          await doc.ref.update({ [`lastSent.${key}`]: today });
        } catch (err) {
          console.error(`⚠️ ${doc.id} xatolik [${err.code}]:`, err.message);
          if (
            err.code === 'messaging/registration-token-not-registered' ||
            err.code === 'messaging/invalid-registration-token'
          ) {
            await doc.ref.update({ [tokenField]: admin.firestore.FieldValue.delete() });
            console.log(`🗑 Yaroqsiz token o'chirildi`);
            break;
          }
        }
      }
    }
  }
}

checkAndSend().catch(err => {
  console.error(err);
  process.exit(1);
});
