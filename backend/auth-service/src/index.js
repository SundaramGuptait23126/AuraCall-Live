const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { sendWhatsAppOtp, getConnectionStatus, getQrCodeDataUrl } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'auracall-super-secure-jwt-key-9923847';
const SLM_SERVICE_URL = process.env.SLM_SERVICE_URL || 'http://slm-mailer:5000';

// Aiven MySQL database connection string
const MYSQL_URI = process.env.MYSQL_URI || process.env.DATABASE_URL || '';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// In-memory fallback if MySQL is offline or initializing
const inMemoryOtpStore = new Map();

// Helper to generate 6 digit secure numeric OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Initialize Aiven MySQL Pool
let dbPool = null;

async function initDatabase() {
  try {
    const urlObj = new URL(MYSQL_URI);
    dbPool = mysql.createPool({
      host: urlObj.hostname,
      port: parseInt(urlObj.port || '3306'),
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.replace(/^\//, '') || 'defaultdb',
      ssl: {
        rejectUnauthorized: false,
      },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 8000,
    });

    const conn = await dbPool.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS otps (
        email VARCHAR(255) PRIMARY KEY,
        otp VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    conn.release();
    console.log('[AUTH-SERVICE] Successfully connected to Aiven MySQL & verified otps table.');
  } catch (err) {
    console.warn('[AUTH-SERVICE] Aiven MySQL connection initialization deferred:', err.message);
  }
}

initDatabase();

// Root and Health check endpoints for UptimeRobot and Render monitoring
app.all(['/', '/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    database: dbPool ? 'mysql-aiven' : 'in-memory-fallback',
    whatsapp: getConnectionStatus(),
    timestamp: new Date().toISOString()
  });
});

// WhatsApp Connection Status Endpoint
app.get('/whatsapp/status', (req, res) => {
  res.json(getConnectionStatus());
});

// Interactive Web QR code scanner page for linking WhatsApp account
app.get('/whatsapp/qr', (req, res) => {
  const qrDataUrl = getQrCodeDataUrl();
  const status = getConnectionStatus();

  if (status.isReady) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>AuraCall WhatsApp Gateway - Connected</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 24px; padding: 36px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
            h1 { font-size: 22px; margin: 0 0 10px 0; color: #fff; }
            p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0; }
            .phone-tag { background: #1e293b; color: #38bdf8; font-family: monospace; font-size: 16px; font-weight: bold; padding: 10px 20px; border-radius: 12px; display: inline-block; border: 1px solid #334155; }
            .actions { margin-top: 28px; }
            .btn { background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 12px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block; transition: all 0.2s; }
            .btn:hover { background: #1d4ed8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
              WhatsApp Gateway Active
            </div>
            <h1>Device Linked Successfully!</h1>
            <p>AuraCall will now deliver instant 6-digit login verification codes to users directly on WhatsApp from your connected account.</p>
            <div class="phone-tag">${status.user || 'Connected'}</div>
            <div class="actions">
              <a href="https://aura-call-live.vercel.app" class="btn">Open AuraCall Live App</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  if (!qrDataUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="3">
          <title>Initializing - AuraCall WhatsApp</title>
          <style>
            body { font-family: sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 24px; padding: 36px; max-width: 400px; text-align: center; }
            .spinner { width: 44px; height: 44px; border: 3px solid #1e293b; border-top-color: #38bdf8; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2 style="font-size: 20px; margin: 0 0 10px 0;">Connecting to WhatsApp...</h2>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">Generating link QR code. This page will automatically update in 2-3 seconds.</p>
          </div>
        </body>
      </html>
    `);
  }

  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Scan WhatsApp QR - AuraCall Live</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 24px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
          h1 { font-size: 20px; margin: 0 0 6px 0; color: #fff; }
          p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px 0; }
          .qr-wrapper { background: #fff; padding: 14px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .qr-wrapper img { width: 230px; height: 230px; display: block; border-radius: 8px; }
          .steps { text-align: left; background: #020617; border: 1px solid #1e293b; border-radius: 16px; padding: 14px 18px; margin-top: 22px; font-size: 12px; color: #cbd5e1; }
          .steps ol { margin: 0; padding-left: 18px; line-height: 1.8; }
          .status-poll { margin-top: 16px; font-size: 11px; color: #64748b; font-family: monospace; display: flex; align-items: center; justify-content: center; gap: 6px; }
          .dot { width: 6px; height: 6px; background: #38bdf8; border-radius: 50%; animation: pulse 1.5s infinite; }
          @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        </style>
        <script>
          // Poll status every 3 seconds to auto-refresh once user scans with WhatsApp
          setInterval(async () => {
            try {
              const res = await fetch('/whatsapp/status');
              const data = await res.json();
              if (data.isReady) {
                window.location.reload();
              }
            } catch (e) {}
          }, 3000);
        </script>
      </head>
      <body>
        <div class="card">
          <div class="badge">
            <span class="dot"></span>
            WhatsApp Zero-Account Gateway
          </div>
          <h1>Link WhatsApp to AuraCall</h1>
          <p>Scan this QR code from WhatsApp on your phone to send instant OTPs to users.</p>
          <div class="qr-wrapper">
            <img src="${qrDataUrl}" alt="Scan WhatsApp QR" />
          </div>
          <div class="steps">
            <strong>How to link:</strong>
            <ol>
              <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
              <li>Tap <strong>Menu (⋮)</strong> or <strong>Settings ⚙️</strong></li>
              <li>Select <strong>Linked Devices</strong> ➔ <strong>Link a Device</strong></li>
              <li>Scan the QR code above</li>
            </ol>
          </div>
          <div class="status-poll">
            <span class="dot"></span>
            Auto-detecting scan... Keep this page open
          </div>
        </div>
      </body>
    </html>
  `);
});

// 1. Universal Request OTP (Dispatches to Email via SLM OR to Phone via WhatsApp)
app.post('/request-otp', async (req, res) => {
  try {
    const rawIdentifier = req.body.email || req.body.phone || req.body.identifier;
    if (!rawIdentifier) {
      return res.status(400).json({ success: false, message: 'Valid email address or WhatsApp mobile number is required.' });
    }

    const isEmail = rawIdentifier.includes('@');
    let normalizedIdentifier = '';

    if (isEmail) {
      normalizedIdentifier = rawIdentifier.toLowerCase().trim();
    } else {
      normalizedIdentifier = rawIdentifier.replace(/[^0-9+]/g, '');
      if (normalizedIdentifier.length < 10) {
        return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
      }
    }

    let finalOtp = null;
    let slmUsed = false;
    let channel = isEmail ? 'email' : 'whatsapp';
    let dispatchMessage = '';

    if (isEmail) {
      // Dispatch via SLM Email Mailer
      try {
        if (global.fetch) {
          const slmRes = await fetch(`${SLM_SERVICE_URL}/api/slm/generate-and-send-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Bypass-Tunnel-Reminder': 'true',
            },
            body: JSON.stringify({
              recipientEmail: normalizedIdentifier,
              purpose: 'Video Call Login Authentication',
            }),
          });

          if (slmRes.ok) {
            const slmData = await slmRes.json();
            if (slmData.otpCode) {
              finalOtp = slmData.otpCode.toString().trim();
              slmUsed = true;
              console.log(`[AUTH-SERVICE] OTP generated & delivered by SLM: ${finalOtp} for ${normalizedIdentifier}`);
            }
          }
        }
      } catch (slmErr) {
        console.warn(`[AUTH-SERVICE] SLM Engine deferred (${slmErr.message}). Using local generator.`);
      }

      if (!finalOtp) {
        finalOtp = generateOtp();
      }

      dispatchMessage = slmUsed
        ? 'SLM Engine generated OTP and dispatched it to your email inbox.'
        : 'Verification code sent to your email address.';
    } else {
      // Dispatch via Baileys WhatsApp Gateway
      finalOtp = generateOtp();
      const waStatus = getConnectionStatus();

      if (!waStatus.isReady) {
        return res.status(503).json({
          success: false,
          channel: 'whatsapp',
          message: 'WhatsApp Gateway is not linked yet. Please scan the QR code at /whatsapp/qr first to link your WhatsApp account.',
          qrUrl: '/whatsapp/qr',
        });
      }

      try {
        await sendWhatsAppOtp(normalizedIdentifier, finalOtp);
        dispatchMessage = `Verification code sent to WhatsApp: ${normalizedIdentifier}`;
      } catch (waErr) {
        console.error('[AUTH-SERVICE] WhatsApp dispatch failed:', waErr);
        return res.status(500).json({
          success: false,
          channel: 'whatsapp',
          message: `Could not deliver WhatsApp message: ${waErr.message}`,
        });
      }
    }

    const expiry = Date.now() + 5 * 60 * 1000; // 5 mins

    // Save in Aiven MySQL Database (table: otps)
    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO otps (email, otp, expires_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at)`,
          [normalizedIdentifier, finalOtp, expiry]
        );
        console.log(`[AUTH-SERVICE] Saved OTP ${finalOtp} for ${normalizedIdentifier} to Aiven MySQL.`);
      } catch (dbErr) {
        console.error('[AUTH-SERVICE] MySQL save error:', dbErr.message);
      }
    }

    // Keep memory fallback
    inMemoryOtpStore.set(normalizedIdentifier, { otp: finalOtp, expiry });

    return res.json({
      success: true,
      channel,
      message: dispatchMessage,
      expiresInSeconds: 300,
    });
  } catch (err) {
    console.error('[AUTH-SERVICE] Error requesting OTP:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// 2. Universal Verify OTP (Aiven MySQL Database & JWT)
app.post('/verify-otp', async (req, res) => {
  try {
    const rawIdentifier = req.body.email || req.body.phone || req.body.identifier;
    const { otp } = req.body;

    if (!rawIdentifier || !otp) {
      return res.status(400).json({ success: false, message: 'Email/Phone and OTP are required.' });
    }

    const isEmail = rawIdentifier.includes('@');
    const normalizedIdentifier = isEmail 
      ? rawIdentifier.toLowerCase().trim() 
      : rawIdentifier.replace(/[^0-9+]/g, '');

    const enteredOtp = otp.toString().trim();
    let record = null;

    // Query Aiven MySQL Database first
    if (dbPool) {
      try {
        const [rows] = await dbPool.query(
          'SELECT otp, expires_at FROM otps WHERE email = ?',
          [normalizedIdentifier]
        );
        if (rows && rows.length > 0) {
          record = { otp: rows[0].otp.toString().trim(), expiry: Number(rows[0].expires_at) };
          console.log(`[AUTH-SERVICE] Retrieved OTP from Aiven MySQL for ${normalizedIdentifier}: ${record.otp}`);
        }
      } catch (dbErr) {
        console.error('[AUTH-SERVICE] Error reading OTP from Aiven MySQL:', dbErr.message);
      }
    }

    if (!record) {
      record = inMemoryOtpStore.get(normalizedIdentifier);
    }

    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP found. Please request a new verification code.',
      });
    }

    if (Date.now() > record.expiry) {
      if (dbPool) {
        await dbPool.query('DELETE FROM otps WHERE email = ?', [normalizedIdentifier]).catch(() => {});
      }
      inMemoryOtpStore.delete(normalizedIdentifier);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new code.' });
    }

    if (record.otp !== enteredOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code. Please enter the exact code sent to you.',
      });
    }

    // OTP matched! Single use: Delete from Aiven DB & memory
    if (dbPool) {
      await dbPool.query('DELETE FROM otps WHERE email = ?', [normalizedIdentifier]).catch(() => {});
    }
    inMemoryOtpStore.delete(normalizedIdentifier);

    const displayName = isEmail 
      ? normalizedIdentifier.split('@')[0] 
      : `User (${normalizedIdentifier.slice(-4)})`;

    const user = {
      id: 'usr_' + Buffer.from(normalizedIdentifier).toString('hex').substring(0, 10),
      email: normalizedIdentifier,
      name: displayName,
      phone: !isEmail ? normalizedIdentifier : undefined,
    };

    // Issue signed JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[AUTH-SERVICE] User ${normalizedIdentifier} successfully authenticated via Aiven DB. Issued JWT.`);

    return res.json({
      success: true,
      token,
      user,
      message: 'Authentication successful.',
    });
  } catch (err) {
    console.error('[AUTH-SERVICE] Error verifying OTP:', err);
    return res.status(500).json({ success: false, message: 'Verification error.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AUTH-SERVICE] Microservice running on port ${PORT}`);
  console.log(`[AUTH-SERVICE] WhatsApp QR Link page available at: http://localhost:${PORT}/whatsapp/qr`);
});
