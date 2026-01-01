const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const config = require('./config.json');

// --- SETTINGS ---
// Set how many messages to pull per chat. Use Infinity for "Everything", 
// but be warned: this takes a long time if you have years of history.
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
async function startBackup() {
    try {
        console.log('🚀 Starting WhatsApp Client...');
        await client.initialize();
    } catch (err) {
        if (err.message.includes('net::ERR_NETWORK_CHANGED')) {
            console.log('🔄 Network changed. Retrying in 5s...');
            setTimeout(startBackup, 5000);
        } else {
            console.error('❌ Init Error:', err.message);
        }
    }
}

// --- EVENTS ---
client.on('qr', (qr) => {
    console.log('⚡ QR CODE GENERATED! Scan this data:', qr);
});

client.on('ready', async () => {
    console.log('✅ Client is ready!');
    console.log('📦 STARTING FULL ACCOUNT BACKUP...');
    await runFullAccountBackup();
});

client.on('message_create', async (msg) => {
    // Keep processing live messages while backup runs or afterwards
    await processMessage(msg);
});

// --- CORE BACKUP LOGIC ---

async function runFullAccountBackup() {
    try {
        const chats = await client.getChats();
        console.log(`📂 Found ${chats.length} chats to process.`);

        for (const chat of chats) {
            // Filter groups based on config
            if (chat.isGroup && !config.SAVE_GROUPS) continue;

            const chatName = (chat.name || chat.id.user).replace(/[^a-zA-Z0-9_\- ]/g, '_');
            console.log(`⏳ Backing up: [${chatName}]`);

            try {
                // This is the heavy lifter: it scrolls back and fetches history
                const messages = await chat.fetchMessages({ limit: BACKUP_LIMIT });
                console.log(`📥 Downloaded ${messages.length} messages for ${chatName}.`);

                for (const msg of messages) {
                    await processMessage(msg);
                }
            } catch (err) {
                console.error(`❌ Failed to fetch history for ${chatName}:`, err.message);
            }

            // Safety delay to prevent WhatsApp from flagging the account
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log('🏁 --- FULL BACKUP OPERATION COMPLETE --- 🏁');
    } catch (err) {
        console.error('Fatal Backup Error:', err);
    }
}

async function processMessage(msg) {
    try {
        const chat = await msg.getChat();
        let folderName = (chat.name || chat.id.user).replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
        
        // Path logic
        const dateFolder = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
        const chatLogPath = path.join(config.BACKUP_DIR, 'chats', folderName);
        const mediaPath = path.join(config.BACKUP_DIR, 'media', dateFolder, folderName);

        await fs.ensureDir(chatLogPath);

        // 1. Save Text Data
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

        // 2. Save Media Data
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
    } catch (e) {
        // Silently catch errors for specific messages (e.g. expired media)
    }
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

startBackup();