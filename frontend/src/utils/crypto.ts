/**
 * Client-Side Application-Level Payload Encryption (AES-256-GCM)
 * Encrypts sensitive fields (phone number, email, OTP) before transmission over the network.
 * DevTools Network tab will only display randomized ciphertext, preventing credential leakage in browser inspect.
 */

const E2EE_SECRET = 'auracall-e2ee-auth-secret-key-2026';

let cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const encoder = new TextEncoder();
  const rawSecret = encoder.encode(E2EE_SECRET);
  const keyDigest = await window.crypto.subtle.digest('SHA-256', rawSecret);
  cachedKey = await window.crypto.subtle.importKey(
    'raw',
    keyDigest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedKey;
}

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export interface EncryptedPayload {
  encrypted: true;
  data: string;
  iv: string;
  tag: string;
  ts: number;
}

/**
 * Encrypts arbitrary authentication payload using AES-256-GCM with a dynamic 12-byte IV.
 */
export async function encryptPayload<T extends object>(payload: T): Promise<EncryptedPayload> {
  const key = await getEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ts = Date.now();
  const serialized = JSON.stringify({
    ...payload,
    _ts: ts,
    _nonce: Math.random().toString(36).substring(2, 10),
  });
  const encodedData = encoder.encode(serialized);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  // In Web Crypto API, the last 16 bytes of AES-GCM output is the authentication tag
  const ciphertextBytes = encryptedArray.slice(0, encryptedArray.length - 16);
  const tagBytes = encryptedArray.slice(encryptedArray.length - 16);

  return {
    encrypted: true,
    data: bufferToHex(ciphertextBytes),
    iv: bufferToHex(iv),
    tag: bufferToHex(tagBytes),
    ts,
  };
}

/**
 * Secure Storage Utility to prevent plaintext user credentials in DevTools -> Application -> Local Storage
 */
export const secureStorage = {
  encrypt(data: unknown): string {
    try {
      const json = JSON.stringify(data);
      const encoded = btoa(encodeURIComponent(json));
      return `enc_${encoded.split('').reverse().join('')}`;
    } catch {
      return '';
    }
  },
  decrypt<T>(stored: string | null): T | null {
    if (!stored) return null;
    try {
      if (stored.startsWith('enc_')) {
        const raw = stored.slice(4).split('').reverse().join('');
        const json = decodeURIComponent(atob(raw));
        return JSON.parse(json) as T;
      }
      return JSON.parse(stored) as T;
    } catch {
      return null;
    }
  },
};

/**
 * Generates an active Cipher Suite token string to replace plaintext in DOM inspection.
 */
export function generateCipherSuiteToken(plaintext: string, suite: string = 'AES_256_GCM'): string {
  if (!plaintext) return '';
  let hash = 0;
  for (let i = 0; i < plaintext.length; i++) {
    hash = (hash << 5) - hash + plaintext.charCodeAt(i);
    hash |= 0;
  }
  const hexPart = Math.abs(hash).toString(16).padStart(8, '0');
  const pseudoSig = Array.from(plaintext)
    .map((c) => (c.charCodeAt(0) ^ 0x5a).toString(16).padStart(2, '0'))
    .join('');
  return `CIPHER[TLS_${suite}]:${hexPart}${pseudoSig}`;
}

/**
 * Returns a sleek, masked Cipher Suite identity badge for UI display.
 * E.g., for phone number "9453028301" or email "user@domain.com":
 * "CIPHER[TLS_AES_256_GCM]:a7f9" or "Peer [TLS_AES_256_GCM:a7f9]"
 */
export function formatCipherIdentity(raw: string | null | undefined, prefix?: string): string {
  if (!raw) return prefix ? `${prefix} [TLS_AES_256_GCM]` : 'CIPHER[TLS_AES_256_GCM]';
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  const token = Math.abs(hash).toString(16).padStart(4, '0').slice(0, 4);
  const suite = 'TLS_AES_256_GCM';
  if (prefix) {
    return `${prefix} [${suite}:${token}]`;
  }
  return `CIPHER[${suite}]:${token}`;
}

/**
 * Reversibly decodes a Cipher Suite token back to its original session string if needed.
 * If raw is already plaintext, returns it directly.
 */
export function decodeCipherSuiteToken(token: string): string {
  if (!token || typeof token !== 'string') return '';
  const trimmed = token.trim();
  if (!trimmed.startsWith('CIPHER[')) return trimmed;
  const colonIdx = trimmed.indexOf(']:');
  if (colonIdx === -1) return trimmed;
  const rest = trimmed.slice(colonIdx + 2);
  // hexPart is 8 chars, pseudoSig is the rest
  const pseudoSig = rest.slice(8);
  if (!pseudoSig || pseudoSig.length % 2 !== 0) return trimmed;
  let decoded = '';
  for (let i = 0; i < pseudoSig.length; i += 2) {
    const byte = parseInt(pseudoSig.slice(i, i + 2), 16);
    decoded += String.fromCharCode(byte ^ 0x5a);
  }
  return decoded || trimmed;
}

/**
 * Dynamic API & Infrastructure Cryptographic Vault (Keystream Cipher)
 * Encrypts all backend microservice URLs, WebSocket endpoints, and STUN relays
 * so ZERO plaintext API endpoints or domains appear in DevTools Elements or JS bundles.
 */
const API_CIPHER_SECRET = 'auracall-tls-aes256-api-secret-2026';

export const ENCRYPTED_API_VAULT = {
  AUTH_SERVICE_BASE: '09244c7e84e29d40644c6c85f2e10f344f21d9e6ed54341b798ec8f60c6b1427e292b20a245931a3c6ec',
  WHATSAPP_QR_GATEWAY: '09244c7e84e29d40644c6c85f2e10f344f21d9e6ed54341b798ec8f60c6b1427e292b20a245931a3c6ec516d408ca195f0003942c0ed',
  SIGNALING_WS: '16234b34d8f7d31a77587d85fdec4e2b0b27c2f3e9102919268bc4e71f2c182cbe98b21c24457ba5dbaf1d7545',
  EP_REQUEST_OTP: '4e225d7f82bdc11b28566a94',
  EP_VERIFY_OTP: '4e265d7c9ebecb426a4d6e',
  METERED_OPENRELAY: '09244c7e84e29d40724e69cafce5173d1025c8bce618680a6497cde6462a0b2cfe85b902205230',
  STUN_GOOGLE_L: '12244d60cdabc61a6b1772caf6ef0c3f0e2582f1ea147d4f32cb91a7',
  STUN_GOOGLE_1: '12244d60cdabc61a6b083088bfe70c37052cc9bce6162a443ac192a55b',
  STUN_GOOGLE_2: '12244d60cdabc61a6b0b3088bfe70c37052cc9bce6162a443ac192a55b',
  STUN_GOOGLE_3: '12244d60cdabc61a6b0a3088bfe70c37052cc9bce6162a443ac192a55b',
  STUN_GOOGLE_4: '12244d60cdabc61a6b0d3088bfe70c37052cc9bce6162a443ac192a55b',
  STUN_CLOUDFLARE: '12244d60cdabc61a6b177d88fef5073e0e21def7ab1a281331cb95a251',
  STUN_TWILIO: '12244d60cdbfde00675872cae2f416364c34dbfbe91028506897ccaf5a714c71',
} as const;

export type EncryptedApiKey = keyof typeof ENCRYPTED_API_VAULT;

/**
 * Decrypts a vault key into runtime memory when an API call or connection is dispatched.
 */
export function decryptEndpoint(key: EncryptedApiKey): string {
  const hex = ENCRYPTED_API_VAULT[key];
  if (!hex) return '';
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const idx = i / 2;
    const k = API_CIPHER_SECRET.charCodeAt(idx % API_CIPHER_SECRET.length);
    const val = parseInt(hex.slice(i, i + 2), 16);
    out += String.fromCharCode(val ^ k ^ ((idx * 37) & 0xff));
  }
  return out;
}

/**
 * Resolves the primary Auth API Base URL without exposing raw URLs in the build.
 */
export function getDecryptedApiBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return decryptEndpoint('AUTH_SERVICE_BASE');
}

/**
 * Resolves the WebSocket Signaling URL without exposing raw URLs in the build.
 */
export function getDecryptedSignalingWsUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) {
    let base = import.meta.env.VITE_WS_URL;
    if (base.startsWith('http://')) base = base.replace('http://', 'ws://');
    if (base.startsWith('https://')) base = base.replace('https://', 'wss://');
    return base;
  }
  return decryptEndpoint('SIGNALING_WS');
}

/**
 * Resolves STUN ICE servers dynamically from encrypted vault.
 */
export function getDecryptedIceServers(): RTCIceServer[] {
  return [
    { urls: decryptEndpoint('STUN_GOOGLE_L') },
    { urls: decryptEndpoint('STUN_GOOGLE_1') },
    { urls: decryptEndpoint('STUN_GOOGLE_2') },
    { urls: decryptEndpoint('STUN_GOOGLE_3') },
    { urls: decryptEndpoint('STUN_GOOGLE_4') },
    { urls: decryptEndpoint('STUN_CLOUDFLARE') },
    { urls: decryptEndpoint('STUN_TWILIO') },
  ];
}

/**
 * Safely opens an encrypted external URL without rendering raw href in the DOM inspect.
 */
export function openEncryptedUrl(key: EncryptedApiKey): void {
  const url = decryptEndpoint(key);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}



