const crypto = require('crypto');

const E2EE_SECRET = process.env.E2EE_AUTH_SECRET || 'auracall-e2ee-auth-secret-key-2026';
const SERVER_KEY = crypto.createHash('sha256').update(E2EE_SECRET).digest();

/**
 * Decrypts an incoming AES-256-GCM encrypted payload from the frontend.
 * @param {object} reqBody - Incoming Express request body
 * @returns {object} - Decrypted plaintext object or original body if plaintext
 */
function decryptPayload(reqBody) {
  if (!reqBody || !reqBody.encrypted || !reqBody.data || !reqBody.iv || !reqBody.tag) {
    // If not encrypted, return original body (backward compatibility)
    return reqBody;
  }

  try {
    const { data, iv, tag } = reqBody;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      SERVER_KEY,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('[CRYPTO] Failed to decrypt incoming payload:', err.message);
    throw new Error('Invalid or corrupted encrypted payload.');
  }
}

/**
 * Masks a phone number or email for safe logging without revealing sensitive user data in logs/inspect.
 */
function maskIdentifier(id) {
  if (!id || typeof id !== 'string') return '***';
  if (id.includes('@')) {
    const parts = id.split('@');
    const name = parts[0];
    const maskedName = name.length > 2 ? name[0] + '***' + name.slice(-1) : name[0] + '***';
    return `${maskedName}@${parts[1]}`;
  }
  const clean = id.replace(/[^0-9]/g, '');
  if (clean.length >= 10) {
    return clean.slice(0, 3) + '******' + clean.slice(-2);
  }
  return '******';
}

module.exports = {
  decryptPayload,
  maskIdentifier,
};
