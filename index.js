const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const config = require('./config.json');

// Kali Linux / VM Optimized Client Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: config.HEADLESS, // Must be false to scan QR
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Fixes VM memory crashes
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('⚡ QR CODE GENERATED!');
    console.log('👉 A Chrome window has opened on your screen.');
    console.log('👉 Please scan the QR code inside that window.');
});

client.on('ready', () => {
    console.log('✅ Client is ready! Listening for messages...');
});

// Capture All Messages (Incoming & Outgoing)
client.on('message_create', async (msg) => {
    try {
        const chat = await msg.getChat();
        if (chat.isGroup && !config.SAVE_GROUPS) return;

        // Create Dates and Paths
        const safeChatId = chat.id._serialized.replace(/[^a-zA-Z0-9@.]/g, '_');
        const dateStr = new Date().toISOString().split('T')[0];
        const chatDir = path.join(config.BACKUP_DIR, 'chats');
        const mediaDir = path.join(config.BACKUP_DIR, 'media', dateStr, safeChatId);

        await fs.ensureDir(chatDir);

        // 1. Save Text
        if (config.SAVE_MESSAGES) {
            const logFile = path.join(chatDir, `${safeChatId}.json`);
            const messageData = {
                id: msg.id.id,
                from: msg.from,
                to: msg.to,
                author: msg.author || msg.from,
                body: msg.body,
                timestamp: new Date(msg.timestamp * 1000).toISOString(),
                hasMedia: msg.hasMedia
            };
            await appendToJson(logFile, messageData);
            console.log(`📝 Text saved: ${safeChatId}`);
        }

        // 2. Save Media
        if (config.SAVE_MEDIA && msg.hasMedia) {
            await fs.ensureDir(mediaDir);
            const media = await msg.downloadMedia();
            if (media) {
                const extension = mime.extension(media.mimetype) || 'bin';
                const filename = `${msg.id.id}.${extension}`;
                await fs.writeFile(path.join(mediaDir, filename), media.data, 'base64');
                console.log(`📷 Media saved: ${filename}`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
});

async function appendToJson(filePath, newData) {
    let data = [];
    try {
        if (await fs.pathExists(filePath)) data = await fs.readJson(filePath);
    } catch (err) { data = []; }
    data.push(newData);
    await fs.writeJson(filePath, data, { spaces: 2 });
}

client.initialize();
