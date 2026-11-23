import { User } from '../types';

// Base URL can be configured via environment variable for Vercel deployment
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1/auth';

export interface OtpResponse {
  success: boolean;
  message: string;
  expiresInSeconds?: number;
}

export interface VerifyResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export const authApi = {
  async requestOtp(email: string): Promise<OtpResponse> {
    try {
      const res = await fetch(`${API_BASE}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data.message || `Failed to request OTP (Status ${res.status})`,
        };
      }
      return data;
    } catch (err: unknown) {
      console.error('Error contacting Auth Service:', err);
      return {
        success: false,
        message: 'Could not connect to Auth Service. Please check your network.',
      };
    }
  },

  async verifyOtp(email: string, otp: string): Promise<VerifyResponse> {
    try {
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data.message || 'Invalid or expired OTP. Please enter the exact code from your email.',
        };
      }
      return data;
    } catch (err: unknown) {
      console.error('Error verifying OTP with Auth Service:', err);
      return {
        success: false,
        message: 'Network error communicating with Auth Service. Please try again.',
      };
    }
  },
};
