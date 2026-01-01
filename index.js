const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const QRCode = require('qrcode-terminal');
const config = require('./config.json');

// --- SETTINGS ---
// Set how many messages to pull per chat. Use Infinity for "Everything", 
// but be warned: this takes a long time if you have years of history.
const BACKUP_LIMIT = config.FULL_BACKUP_LIMIT || 1000; 

const client = new Client({
    // LocalAuth stores session data in the .wwebjs_auth directory
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

<<<<<<< HEAD
// --- EVENTS ---
client.on('qr', (qr) => {
    console.log('⚡ QR CODE GENERATED! Scan this data:', qr);
=======
let lastQRTime = 0;

client.on('qr', (qr) => {
    // Display QR code directly in terminal using qrcode-terminal
    const now = Date.now();
    
    // Only display QR code every 3 seconds to avoid spam
    if (now - lastQRTime > 3000) {
        console.clear();
        console.log('\n⚡ QR CODE GENERATED! Scan with WhatsApp > Linked Devices:\n');
        QRCode.generate(qr, { small: true });
        console.log('\n📱 Open WhatsApp > Linked Devices and scan the QR code above\n');
        lastQRTime = now;
    }
>>>>>>> cebf0ce87339d9c9992303b62bb152e48816e327
});

client.on('ready', async () => {
    console.log('✅ Client is ready!');
<<<<<<< HEAD
    console.log('📦 STARTING FULL ACCOUNT BACKUP...');
    await runFullAccountBackup();
=======
    console.log('🔄 Starting Synchronization (Filling gaps since last log out)...');
    await syncRecentMessages(); // Triggers sync on startup
    console.log('✅ Sync Complete! Listening for new messages...');
>>>>>>> cebf0ce87339d9c9992303b62bb152e48816e327
});

client.on('message_create', async (msg) => {
    // Keep processing live messages while backup runs or afterwards
    await processMessage(msg);
});

<<<<<<< HEAD
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
=======
// Error event handler
client.on('error', (error) => {
    console.error('❌ Client Error:', error.message);
});

// Disconnected event handler (MODIFIED FOR CLEAN EXIT)
client.on('disconnected', async (reason) => {
    console.log(`⚠️ Client disconnected. Reason: ${reason}. Triggering clean shutdown...`);
    
    try {
        // 1. Destroy the client instance to release resources/locks
        await client.destroy(); 
        console.log('✅ Client instance destroyed successfully.');
    } catch (err) {
        console.error('❌ Error during client destruction:', err.message);
    }
    
    // 2. Exit the current Node.js process. 
    // This is the signal for PM2 (or any other process manager) to restart the script.
    await new Promise(r => setTimeout(r, 2000)); // Wait a moment for OS cleanup
    console.log('🔄 Restarting application via process manager...');
    process.exit(0); 
});

// --- CORE FUNCTIONS ---

// 5. Helper: Get a safe, descriptive filename/folder name for the chat
async function getChatFilenameBase(chat, msgFrom) {
    let filenameBase = chat.id._serialized; // Default: full WhatsApp ID
    
    if (!chat.isGroup) {
        try {
            // Use getContactById() with chat.id._serialized (which is the partner's ID)
            const contact = await client.getContactById(chat.id._serialized);
            // Get the name, or fall back to pushname, or the raw number ID
            const contactName = contact.name || contact.pushname || contact.id.user; 
            
            if (contactName) {
                // Sanitize the name for use as a safe filename
                filenameBase = contactName.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
            }
        } catch (contactErr) {
            // If contact retrieval fails, fall back to phone number from the message or chat ID
            const phoneNumber = msgFrom ? msgFrom.split('@')[0] : chat.id.user;
            if (phoneNumber && phoneNumber.length > 0) {
                filenameBase = phoneNumber;
            }
            // console.warn(`⚠️ Contact retrieval error for ${chat.id._serialized}:`, contactErr.message);
        }
    } else {
        // For groups, use the group subject/name if available
        filenameBase = (chat.name && chat.name.trim()) || chat.id._serialized;
        filenameBase = filenameBase.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
    }
    return filenameBase;
}


// 1. Universal Message Processor (Handles Text, Media, View Once, and File Naming)
async function processMessage(msg) {
    try {
        const chat = await msg.getChat();
        // Check config to see if groups should be backed up
        if (chat.isGroup && !config.SAVE_GROUPS) return;

        // --- DYNAMIC FILE NAMING LOGIC ---
        // Pass msg.from to the helper to ensure we have a fallback phone number
        const filenameBase = await getChatFilenameBase(chat, msg.from); 
>>>>>>> cebf0ce87339d9c9992303b62bb152e48816e327

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

<<<<<<< HEAD
// --- HELPERS ---
async function checkDuplicate(file, id) {
    if (!(await fs.pathExists(file))) return false;
    try {
        const data = await fs.readJson(file);
        return data.some(m => m.id === id);
    } catch { return false; }
=======
// 2. Synchronization Logic (Modified for Chronological Integrity)
async function syncRecentMessages() {
    try {
        const chats = await client.getChats();
        
        // Use 99999 as the reliable default for sync-all
        const limit = config.SYNC_LIMIT || 99999; 
        
        console.log(`📂 Found ${chats.length} active chats. Syncing last ${limit} messages each...`);

        for (const chat of chats) {
            if (chat.isGroup && !config.SAVE_GROUPS) continue;
            
            // Fetches messages from the chat history
            const messages = await chat.fetchMessages({ 
                limit: limit,
                fromMe: true // Include messages sent by me in the sync
            });
            
            // CRITICAL FIX: messages are returned newest-first. Reverse them to process 
            // oldest-first, ensuring chronological order in the log file.
            for (const msg of messages.reverse()) { 
                await processMessage(msg); // Deduplication handles skipping existing messages
            }
            
            // Small delay to prevent banning/flooding
            await new Promise(r => setTimeout(r, 500)); 
        }
    } catch (err) {
        console.error('Sync Error:', err);
    }
>>>>>>> cebf0ce87339d9c9992303b62bb152e48816e327
}

async function appendToJson(file, entry) {
    let data = [];
    if (await fs.pathExists(file)) {
        try { data = await fs.readJson(file); } catch { data = []; }
    }
    data.push(entry);
    await fs.writeJson(file, data, { spaces: 2 });
}

<<<<<<< HEAD
startBackup();
=======
// 4. Helper: Check for duplicates
async function checkDuplicate(filePath, msgId) {
    try {
        if (await fs.pathExists(filePath)) {
            const data = await fs.readJson(filePath);
            return data.some(m => m.id === msgId);
        }
    } catch (err) { return false; }
    return false;
}

// Initialize the client with error handling
client.initialize().catch((err) => {
    console.error('❌ Failed to initialize client:', err.message);
    process.exit(1);
});
>>>>>>> cebf0ce87339d9c9992303b62bb152e48816e327
