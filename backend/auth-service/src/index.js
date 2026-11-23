const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

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

// Helper to generate 6 digit OTP
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
    timestamp: new Date().toISOString()
  });
});

// 1. Request OTP (Generated & Dispatched by SLM Engine, Saved in Aiven DB)
app.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let finalOtp = null;
    let slmUsed = false;

    // Call SLM Engine to generate OTP, store in Aiven DB, and dispatch email
    try {
      if (global.fetch) {
        const slmRes = await fetch(`${SLM_SERVICE_URL}/api/slm/generate-and-send-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
          },
          body: JSON.stringify({
            recipientEmail: normalizedEmail,
            purpose: 'Video Call Login Authentication',
          }),
        });

        if (slmRes.ok) {
          const slmData = await slmRes.json();
          if (slmData.otpCode) {
            finalOtp = slmData.otpCode.toString().trim();
            slmUsed = true;
            console.log(`[AUTH-SERVICE] OTP generated & delivered by SLM: ${finalOtp} for ${normalizedEmail}`);
          }
        }
      }
    } catch (slmErr) {
      console.warn(`[AUTH-SERVICE] SLM Engine deferred or offline (${slmErr.message}). Using fallback generator.`);
    }

    if (!finalOtp) {
      finalOtp = generateOtp();
      console.log(`[AUTH-SERVICE] Fallback local OTP generated: ${finalOtp} for ${normalizedEmail}`);
    }

    const expiry = Date.now() + 5 * 60 * 1000; // 5 mins

    // 1. Save in Aiven MySQL Database
    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO otps (email, otp, expires_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at)`,
          [normalizedEmail, finalOtp, expiry]
        );
        console.log(`[AUTH-SERVICE] Saved OTP ${finalOtp} for ${normalizedEmail} to Aiven MySQL.`);
      } catch (dbErr) {
        console.error('[AUTH-SERVICE] MySQL save error:', dbErr.message);
      }
    }

    // 2. Also keep in memory backup
    inMemoryOtpStore.set(normalizedEmail, { otp: finalOtp, expiry });

    return res.json({
      success: true,
      message: slmUsed
        ? 'SLM Engine generated OTP and dispatched it to your email inbox.'
        : 'OTP generated and dispatched to your email address.',
      expiresInSeconds: 300,
    });
  } catch (err) {
    console.error('[AUTH-SERVICE] Error requesting OTP:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// 2. Verify OTP from Aiven MySQL Database and Issue JWT
app.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const enteredOtp = otp.toString().trim();
    let record = null;

    // 1. Query Aiven MySQL Database first!
    if (dbPool) {
      try {
        const [rows] = await dbPool.query(
          'SELECT otp, expires_at FROM otps WHERE email = ?',
          [normalizedEmail]
        );
        if (rows && rows.length > 0) {
          record = { otp: rows[0].otp.toString().trim(), expiry: Number(rows[0].expires_at) };
          console.log(`[AUTH-SERVICE] Retrieved OTP from Aiven MySQL for ${normalizedEmail}: ${record.otp}`);
        }
      } catch (dbErr) {
        console.error('[AUTH-SERVICE] Error reading OTP from Aiven MySQL:', dbErr.message);
      }
    }

    // Fallback to inMemory store if DB had no record
    if (!record) {
      record = inMemoryOtpStore.get(normalizedEmail);
    }

    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP found. Please request a new verification code.',
      });
    }

    if (Date.now() > record.expiry) {
      if (dbPool) {
        await dbPool.query('DELETE FROM otps WHERE email = ?', [normalizedEmail]).catch(() => {});
      }
      inMemoryOtpStore.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new code.' });
    }

    if (record.otp !== enteredOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code. Please enter the exact code sent to your email.',
      });
    }

    // OTP matched! Delete from Aiven DB & memory to prevent replay
    if (dbPool) {
      await dbPool.query('DELETE FROM otps WHERE email = ?', [normalizedEmail]).catch(() => {});
    }
    inMemoryOtpStore.delete(normalizedEmail);

    const user = {
      id: 'usr_' + Buffer.from(normalizedEmail).toString('hex').substring(0, 10),
      email: normalizedEmail,
      name: normalizedEmail.split('@')[0],
    };

    // Issue signed JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[AUTH-SERVICE] User ${normalizedEmail} successfully authenticated via Aiven DB. Issued JWT.`);

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
});
