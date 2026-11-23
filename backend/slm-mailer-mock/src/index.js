const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// SLM Mail Generation & Dispatch Endpoint
app.post('/api/slm/send-mail', (req, res) => {
  const { recipientEmail, otpCode, purpose } = req.body;

  if (!recipientEmail || !otpCode) {
    return res.status(400).json({ error: 'recipientEmail and otpCode are required' });
  }

  // Simulated SLM inference: generate natural, contextual email copy
  const emailSubject = `Your AuraCall Verification Code: ${otpCode}`;
  const emailBody = `
Hello,

You requested access for: ${purpose || 'Video Call Authentication'}.

Your secure one-time passcode is: ${otpCode}

This code is valid for 5 minutes. If you did not initiate this request, please disregard this message.

Best regards,
AuraCall SLM Authentication Engine
  `.trim();

  console.log(`\n================== [SLM EMAIL DISPATCHED] ==================`);
  console.log(`To: ${recipientEmail}`);
  console.log(`Subject: ${emailSubject}`);
  console.log(`Body:\n${emailBody}`);
  console.log(`============================================================\n`);

  return res.json({
    success: true,
    message: `SLM successfully dispatched email to ${recipientEmail}`,
    recipient: recipientEmail,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'slm-mailer-service' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SLM-MAILER] Microservice listening on port ${PORT}`);
});
