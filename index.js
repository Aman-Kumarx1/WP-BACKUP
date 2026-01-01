const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const QRCode = require('qrcode-terminal');
const config = require('./config.json');

// --- SETTINGS ---
const BACKUP_LIMIT = config.FULL_BACKUP_LIMIT || 1000; 

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: config.HEADLESS,
        navigationTimeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

// --- INITIALIZATION ---
async function startApp() {
    try {
        console.log('🚀 Starting WhatsApp Client...');
        await client.initialize();
    } catch (err) {
        if (err.message.includes('net::ERR_NETWORK_CHANGED')) {
            console.log('🔄 Network changed. Retrying in 5s...');
            setTimeout(startApp, 5000);
        } else {
            console.error('❌ Init Error:', err.message);
        }
    }
}

// --- EVENTS ---
let lastQRTime = 0;
client.on('qr', (qr) => {
    const now = Date.now();
    if (now - lastQRTime > 3000) {
        console.clear();
        console.log('\n⚡ QR CODE GENERATED! Scan with WhatsApp > Linked Devices:\n');
        QRCode.generate(qr, { small: true });
        lastQRTime = now;
    }
});

client.on('ready', async () => {
    console.log('✅ Client is ready!');
    console.log('📦 STARTING DEEP ACCOUNT BACKUP...');
    await runFullAccountBackup();
});

client.on('message_create', async (msg) => {
    await processMessage(msg);
});

client.on('disconnected', async (reason) => {
    console.log(`⚠️ Disconnected: ${reason}. Restarting...`);
    process.exit(0); 
});

// --- CORE BACKUP LOGIC ---

async function runFullAccountBackup() {
    try {
        const chats = await client.getChats();
        console.log(`📂 Found ${chats.length} chats to process.`);

        for (const chat of chats) {
            if (chat.isGroup && !config.SAVE_GROUPS) continue;

            const chatName = (chat.name || chat.id.user).replace(/[^a-zA-Z0-9_\- ]/g, '_');
            console.log(`⏳ Backing up: [${chatName}]`);

            try {
                const messages = await chat.fetchMessages({ limit: BACKUP_LIMIT });
                // Reverse to process oldest first (chronological order)
                for (const msg of messages.reverse()) {
                    await processMessage(msg);
                }
            } catch (err) {
                console.error(`❌ Failed history for ${chatName}:`, err.message);
            }
            await new Promise(r => setTimeout(r, 1500));
        }
        console.log('🏁 --- FULL BACKUP COMPLETE --- 🏁');
    } catch (err) {
        console.error('Fatal Backup Error:', err);
    }
}

async function processMessage(msg) {
    try {
        const chat = await msg.getChat();
        let folderName = (chat.name || chat.id.user).replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
        
        const dateFolder = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
        const chatLogPath = path.join(config.BACKUP_DIR, 'chats', folderName);
        const mediaPath = path.join(config.BACKUP_DIR, 'media', dateFolder, folderName);

        await fs.ensureDir(chatLogPath);

        const logFile = path.join(chatLogPath, 'history.json');
        const isDuplicate = await checkDuplicate(logFile, msg.id.id);
        
        if (!isDuplicate) {
            const entry = {
                id: msg.id.id,
                time: new Date(msg.timestamp * 1000).toLocaleString(),
                sender: msg.author || msg.from,
                body: msg.body,
                media: msg.hasMedia
            };
            await appendToJson(logFile, entry);
        }

        if (msg.hasMedia && config.SAVE_MEDIA) {
            await fs.ensureDir(mediaPath);
            const media = await msg.downloadMedia();
            if (media) {
                const ext = mime.extension(media.mimetype) || 'bin';
                const fileName = `${msg.id.id}.${ext}`;
                const fullPath = path.join(mediaPath, fileName);
                
                if (!(await fs.pathExists(fullPath))) {
                    await fs.writeFile(fullPath, media.data, 'base64');
                }
            }
        }
    } catch (e) {}
}

// --- HELPERS ---
async function checkDuplicate(file, id) {
    if (!(await fs.pathExists(file))) return false;
    try {
        const data = await fs.readJson(file);
        return data.some(m => m.id === id);
    } catch { return false; }
}

async function appendToJson(file, entry) {
    let data = [];
    if (await fs.pathExists(file)) {
        try { data = await fs.readJson(file); } catch { data = []; }
    }
    data.push(entry);
    await fs.writeJson(file, data, { spaces: 2 });
}

startApp();