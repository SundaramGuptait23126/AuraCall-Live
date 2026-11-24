import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Mail, 
  KeyRound, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  Phone, 
  MessageCircle, 
  QrCode, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
}

type AuthChannel = 'whatsapp' | 'email';

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const { requestOtp, verifyOtp } = useAuth();
  const [channel, setChannel] = useState<AuthChannel>('whatsapp');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const identifier = channel === 'whatsapp' ? phone : email;

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

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (channel === 'email') {
      if (!email || !email.includes('@')) {
        setError('Please provide a valid email address');
        return;
      }
    } else {
      const cleanDigits = phone.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 10) {
        setError('Please enter a valid 10-digit mobile number');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const targetIdentifier = channel === 'email' ? email.trim() : phone.trim();

    try {
      const res = await requestOtp(targetIdentifier);
      if (res.success) {
        setStep('otp');
        setSuccessMsg(res.message || 'OTP sent successfully!');
        startCountdown();
      } else {
        setError(res.message || 'Failed to dispatch verification code');
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
      setError('Please enter the complete 6-digit verification code');
      return;
    }

    setLoading(true);
    setError(null);
    const targetIdentifier = channel === 'email' ? email.trim() : phone.trim();

    try {
      const res = await verifyOtp(targetIdentifier, otp);
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

  const handlePhoneChange = (val: string) => {
    // Keep + and numbers
    const clean = val.replace(/[^0-9+]/g, '');
    setPhone(clean);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-2xl">
        {/* Glow accents */}
        <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            AuraCall Video
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Ultra-low latency WebRTC with WhatsApp & Email OTP
          </p>
        </div>

        {/* Tab Channel Selector (WhatsApp vs Email) */}
        {step === 'input' && (
          <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-950/70 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setChannel('whatsapp');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                channel === 'whatsapp'
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageCircle className="h-4 w-4 text-emerald-300" />
              WhatsApp OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setChannel('email');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                channel === 'email'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="h-4 w-4 text-cyan-300" />
              Email OTP
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
            <p>{error}</p>
            {error.includes('/whatsapp/qr') && (
              <a
                href="https://auracall-auth-service.onrender.com/whatsapp/qr"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 underline"
              >
                <QrCode className="h-3.5 w-3.5" />
                Scan WhatsApp QR Code Now
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {/* Success message */}
        {successMsg && !error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {step === 'input' ? (
          <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
            {channel === 'whatsapp' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  WhatsApp Mobile Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+91 98765 43210"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Enter 10-digit number with or without +91</span>
                  <a
                    href="https://auracall-auth-service.onrender.com/whatsapp/qr"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline"
                  >
                    <QrCode className="h-3 w-3" />
                    Link Gateway
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            ) : (
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
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold text-white shadow-lg focus:outline-none focus:ring-2 transition disabled:opacity-50 ${
                channel === 'whatsapp'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/25 hover:from-emerald-500 hover:to-teal-500 focus:ring-emerald-400'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 focus:ring-cyan-400'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {channel === 'whatsapp' ? 'Sending WhatsApp OTP...' : 'Generating OTP via SLM...'}
                </>
              ) : (
                <>
                  {channel === 'whatsapp' ? 'Send WhatsApp OTP' : 'Continue with Email'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                {channel === 'whatsapp' ? 'Instant WhatsApp Delivery' : 'SLM Mailer Engine Verification'}
              </div>
              <p>
                {channel === 'whatsapp'
                  ? 'Receive a direct WhatsApp message with a secure 6-digit one-time passcode valid for 5 minutes.'
                  : 'Your custom Small Language Model generates a smart, secure verification message delivered right to your inbox.'}
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Change {channel === 'whatsapp' ? 'Number' : 'Email'}
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-center font-mono text-lg tracking-widest text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
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
                  Verifying Security Token...
                </>
              ) : (
                'Verify & Enter Calling Lobby'
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span className="text-[11px] text-slate-500 truncate max-w-[200px]">
                Sent to: <span className="text-slate-300">{identifier}</span>
              </span>
              {countdown > 0 ? (
                <span className="text-slate-500">Resend in {countdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRequestOtp()}
                  className="text-cyan-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <RefreshCw className="h-3 w-3" /> Resend OTP
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
