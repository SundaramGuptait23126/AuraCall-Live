const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const AUTH_FOLDER = path.join(__dirname, '../baileys_auth');
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

let sock = null;
let latestQrDataUrl = null;
let latestQrRaw = null;
let connectionStatus = 'initializing';
let connectedUser = null;
let isReconnecting = false;

async function startWhatsAppClient() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: true }));

    console.log(`[WHATSAPP] Initializing Baileys client (v${version.join('.')}, isLatest: ${isLatest})...`);

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false, // We print custom formatted QR
      browser: ['AuraCall Video Live', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQrRaw = qr;
        connectionStatus = 'waiting_for_qr_scan';
        try {
          latestQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          // Print formatted ASCII QR to terminal
          const terminalQr = await QRCode.toString(qr, { type: 'terminal', small: true });
          console.log('\n======================================================');
          console.log('   SCAN THIS QR CODE IN WHATSAPP (LINKED DEVICES):   ');
          console.log('======================================================\n');
          console.log(terminalQr);
          console.log('\n[WHATSAPP] Or view QR in browser: https://auracall-auth-service.onrender.com/whatsapp/qr\n');
        } catch (qrErr) {
          console.error('[WHATSAPP] QR generation error:', qrErr);
        }
      }

      if (connection === 'connecting') {
        connectionStatus = 'connecting';
        console.log('[WHATSAPP] Connecting to WhatsApp Web server...');
      }

      if (connection === 'open') {
        connectionStatus = 'open';
        latestQrDataUrl = null;
        latestQrRaw = null;
        isReconnecting = false;
        connectedUser = sock.user ? sock.user.id.split(':')[0] : 'Connected';
        console.log(`[WHATSAPP] ✅ Connected successfully! Ready to send OTPs from: +${connectedUser}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'disconnected';
        connectedUser = null;

        console.log(`[WHATSAPP] Connection closed (code: ${statusCode}, reason: ${lastDisconnect?.error?.message || 'Unknown'}). Reconnecting: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WHATSAPP] Session logged out. Wiping credentials for fresh QR code scan...');
          try {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
          } catch (e) {
            console.warn('[WHATSAPP] Error cleaning auth folder:', e);
          }
          setTimeout(() => startWhatsAppClient(), 2000);
        } else if (shouldReconnect && !isReconnecting) {
          isReconnecting = true;
          setTimeout(() => {
            isReconnecting = false;
            startWhatsAppClient();
          }, 4000);
        }
      }
    });

  } catch (err) {
    console.error('[WHATSAPP] Error initializing socket:', err);
    setTimeout(() => startWhatsAppClient(), 5000);
  }
}

/**
 * Sends a 6-digit verification code to the target WhatsApp mobile number.
 * @param {string} phone - Mobile number (e.g. "+91 98765 43210" or "9876543210")
 * @param {string} otpCode - 6-digit OTP code (e.g. "492019")
 */
async function sendWhatsAppOtp(phone, otpCode) {
  if (!sock || connectionStatus !== 'open') {
    throw new Error('WhatsApp service is not connected yet. Please link your device via /whatsapp/qr first.');
  }

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  // Default to India (+91) if 10-digit mobile number provided
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  const messageText = `🔐 *AuraCall Video Verification*\n\nYour 6-digit security login code is:\n\n*${otpCode}*\n\n⏱️ This code is valid for *5 minutes*.\n⚠️ Do NOT share this code with anyone.\n\n_AuraCall Live Microservices Gateway_`;

  const result = await sock.sendMessage(jid, {
    text: messageText,
  });

  console.log(`[WHATSAPP] 🚀 OTP dispatched to +${cleanPhone} (Message ID: ${result?.key?.id})`);
  return { success: true, messageId: result?.key?.id };
}

function getConnectionStatus() {
  return {
    status: connectionStatus,
    isReady: connectionStatus === 'open',
    user: connectedUser ? `+${connectedUser}` : null,
    hasQr: !!latestQrDataUrl,
    timestamp: new Date().toISOString(),
  };
}

function getQrCodeDataUrl() {
  return latestQrDataUrl;
}

// Auto-start Baileys client on process launch
startWhatsAppClient();

module.exports = {
  sendWhatsAppOtp,
  getConnectionStatus,
  getQrCodeDataUrl,
};
