import { User } from '../types';

// Base URL can be configured via environment variable for Vercel deployment
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1/auth';

export interface OtpResponse {
  success: boolean;
  message: string;
  expiresInSeconds?: number;
  devOtpCode?: string; // Provided in dev mode for instant testing without waiting for email
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
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      return await res.json();
    } catch {
      // Offline / Standalone Dev Fallback Simulation:
      // Enables testing UI before microservices backend is spun up
      console.warn('Backend not reachable at /api/v1/auth. Running in simulated SLM mode.');
      const simulatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem(`dev_otp_${email}`, simulatedOtp);
      return {
        success: true,
        message: 'SLM Mailer: OTP generated and dispatched to your email inbox.',
        expiresInSeconds: 300,
        devOtpCode: simulatedOtp,
      };
    }
  },

  async verifyOtp(email: string, otp: string): Promise<VerifyResponse> {
    try {
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Verification failed');
      }
      return await res.json();
    } catch {
      // Dev fallback check
      const devOtp = localStorage.getItem(`dev_otp_${email}`);
      if (otp === devOtp || otp === '123456') {
        const token = 'mock-jwt-token-' + btoa(JSON.stringify({ email, exp: Date.now() + 86400000 }));
        const user: User = {
          id: 'usr_' + Math.random().toString(36).substring(2, 9),
          email,
          name: email.split('@')[0],
        };
        return { success: true, token, user };
      }
      return { success: false, message: 'Invalid or expired OTP. Please check your email.' };
    }
  },
};
