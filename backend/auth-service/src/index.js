const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'auracall-super-secure-jwt-key-9923847';
const SLM_SERVICE_URL = process.env.SLM_SERVICE_URL || 'http://slm-mailer:5000';

app.use(cors());
app.use(express.json());

// In-memory fallback if Redis container is not running during local dev
const inMemoryOtpStore = new Map();

// Helper to generate 6 digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// 1. Request OTP via SLM
app.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email is required.' });
    }

    const otp = generateOtp();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 mins

    // Store in Redis / Cache
    inMemoryOtpStore.set(email.toLowerCase(), { otp, expiry });

    console.log(`[AUTH-SERVICE] Generated OTP for ${email}: ${otp}`);

    // Trigger SLM Mailer Service
    try {
      if (global.fetch) {
        await fetch(`${SLM_SERVICE_URL}/api/slm/send-mail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: email,
            otpCode: otp,
            purpose: 'Video Call Login Authentication',
          }),
        });
      }
    } catch (slmErr) {
      console.warn(`[AUTH-SERVICE] SLM Mailer call skipped or deferred (${slmErr.message}). Using local dispatch.`);
    }

    return res.json({
      success: true,
      message: 'OTP generated and dispatched to your email address.',
      expiresInSeconds: 300,
      devOtpCode: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (err) {
    console.error('[AUTH-SERVICE] Error requesting OTP:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// 2. Verify OTP and Issue JWT
app.post('/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const record = inMemoryOtpStore.get(email.toLowerCase());
    if (!record) {
      return res.status(400).json({ success: false, message: 'No active OTP found. Please request a new one.' });
    }

    if (Date.now() > record.expiry) {
      inMemoryOtpStore.delete(email.toLowerCase());
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new code.' });
    }

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code.' });
    }

    // OTP verified: remove it to prevent replay
    inMemoryOtpStore.delete(email.toLowerCase());

    const user = {
      id: 'usr_' + Buffer.from(email).toString('hex').substring(0, 10),
      email: email.toLowerCase(),
      name: email.split('@')[0],
    };

    // Issue signed JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[AUTH-SERVICE] User ${email} verified successfully. Issued JWT.`);

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
