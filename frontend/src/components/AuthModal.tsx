import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, KeyRound, ArrowRight, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const { requestOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helperCode, setHelperCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await requestOtp(email);
      if (res.success) {
        setStep('otp');
        if (res.devOtpCode) {
          setHelperCode(res.devOtpCode);
        }
        startCountdown();
      } else {
        setError(res.message || 'Failed to dispatch OTP');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error requesting OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Please enter complete 6-digit verification code');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await verifyOtp(email, otp);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.message || 'Incorrect OTP code');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-2xl">
        {/* Glow accent */}
        <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            AuraCall Video
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Microservices-based WebRTC with SLM Mailer Authentication
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating OTP via SLM...
                </>
              ) : (
                <>
                  Continue with Email
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                SLM OTP Verification
              </div>
              <p>Your custom Small Language Model generates a smart, secure verification message delivered right to your inbox.</p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Change Email
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-center font-mono text-lg tracking-widest text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>
            </div>

            {/* Dev helper pill so developer or tester can quickly click & test */}
            {helperCode && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-2.5 text-xs text-cyan-300 flex items-center justify-between">
                <span>Dev SLM Mail Code: <strong className="font-mono text-cyan-200">{helperCode}</strong></span>
                <button
                  type="button"
                  onClick={() => setOtp(helperCode)}
                  className="rounded bg-cyan-600/40 hover:bg-cyan-600/70 px-2 py-0.5 text-[11px] font-semibold text-white transition"
                >
                  Auto-fill
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Verifying JWT Token...
                </>
              ) : (
                'Verify & Enter Calling Lobby'
              )}
            </button>

            <div className="flex items-center justify-center text-xs text-slate-400">
              {countdown > 0 ? (
                <span>Resend code in {countdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  className="text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Resend OTP via SLM
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
