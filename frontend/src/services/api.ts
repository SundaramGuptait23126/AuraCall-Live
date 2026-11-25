import { User } from '../types';
import { 
  encryptPayload, 
  getDecryptedApiBase, 
  decryptEndpoint 
} from '../utils/crypto';

export interface OtpResponse {
  success: boolean;
  message: string;
  expiresInSeconds?: number;
  channel?: 'email' | 'whatsapp';
  qrUrl?: string;
}

export interface VerifyResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export const authApi = {
  async requestOtp(identifier: string): Promise<OtpResponse> {
    try {
      const isEmail = identifier.includes('@');
      const clean = isEmail ? identifier.trim().toLowerCase() : identifier.trim();

      // Encrypt sensitive phone / email using AES-256-GCM before transmission
      // Prevents credentials from showing in plaintext in DevTools Network inspect
      const encryptedBody = await encryptPayload({
        email: clean,
        phone: clean,
        identifier: clean,
      });

      const apiBase = getDecryptedApiBase();
      const endpoint = decryptEndpoint('EP_REQUEST_OTP');

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encryptedBody),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data.message || `Failed to request OTP (Status ${res.status})`,
          qrUrl: data.qrUrl,
        };
      }
      return data;
    } catch (err: unknown) {
      console.error('Auth request deferred:', err instanceof Error ? err.message : 'Network error');
      return {
        success: false,
        message: 'Could not connect to Auth Service. Please check your network.',
      };
    }
  },

  async verifyOtp(identifier: string, otp: string): Promise<VerifyResponse> {
    try {
      const isEmail = identifier.includes('@');
      const clean = isEmail ? identifier.trim().toLowerCase() : identifier.trim();

      // Encrypt sensitive credentials & OTP using AES-256-GCM before transmission
      // Prevents OTP from showing in plaintext in DevTools Network inspect
      const encryptedBody = await encryptPayload({
        email: clean,
        phone: clean,
        identifier: clean,
        otp: otp.trim(),
      });

      const apiBase = getDecryptedApiBase();
      const endpoint = decryptEndpoint('EP_VERIFY_OTP');

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encryptedBody),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data.message || 'Invalid or expired OTP. Please enter the exact code sent to you.',
        };
      }
      return data;
    } catch (err: unknown) {
      console.error('Auth verify deferred:', err instanceof Error ? err.message : 'Network error');
      return {
        success: false,
        message: 'Network error communicating with Auth Service. Please try again.',
      };
    }
  },
};

