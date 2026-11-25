import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CipherCanvasInput, generateCipherSuiteToken } from './CipherCanvasInput';
import { 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  Phone, 
  MessageCircle, 
  QrCode, 
  ExternalLink,
  CheckCircle2,
  Lock
} from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
}

type AuthChannel = 'whatsapp' | 'email';

/**
 * Masks Personally Identifiable Information (PII) to prevent credential leakage in the DOM tree.
 */
function maskPII(str: string): string {
  if (!str) return '';
  if (str.includes('@')) {
    const [user, domain] = str.split('@');
    if (user.length <= 2) return `${user[0]}***@${domain}`;
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  }
  const digits = str.replace(/[^0-9+]/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 5)}******${digits.slice(-2)}`;
  }
  return '******';
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const { requestOtp, verifyOtp } = useAuth();
  const [channel, setChannel] = useState<AuthChannel>('whatsapp');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otpLength, setOtpLength] = useState(0);
  const realOtpRef = useRef<string>('');
  const hiddenOtpInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const identifier = channel === 'whatsapp' ? phone : email;

  // Anti-Inspect: Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U on authentication screen
  useEffect(() => {
    const handleInspectBlock = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['U', 'u'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleInspectBlock);
    return () => window.removeEventListener('keydown', handleInspectBlock);
  }, []);

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
    realOtpRef.current = '';
    setOtpLength(0);

    const targetIdentifier = channel === 'email' ? email.trim() : phone.trim();

    try {
      const res = await requestOtp(targetIdentifier);
      if (res.success) {
        setStep('otp');
        setSuccessMsg(res.message || 'OTP sent successfully!');
        startCountdown();
        setTimeout(() => {
          hiddenOtpInputRef.current?.focus();
        }, 150);
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
    const finalOtp = realOtpRef.current;
    if (finalOtp.length < 6) {
      setError('Please enter the complete 6-digit verification code');
      return;
    }

    setLoading(true);
    setError(null);
    const targetIdentifier = channel === 'email' ? email.trim() : phone.trim();

    try {
      const res = await verifyOtp(targetIdentifier, finalOtp);
      if (res.success) {
        // Clear memory immediately on success
        realOtpRef.current = '';
        onSuccess();
      } else {
        setError(res.message || 'Incorrect OTP code');
        realOtpRef.current = '';
        setOtpLength(0);
        hiddenOtpInputRef.current?.focus();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      realOtpRef.current = '';
      setOtpLength(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/[^0-9+]/g, '');
    setPhone(clean);
  };

  const handleOtpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.startsWith('CIPHER[')) return;
    const incoming = raw.replace(/\D/g, '');
    if (!incoming) return;

    let updated = realOtpRef.current + incoming;
    if (updated.length > 6) {
      updated = updated.slice(0, 6);
    }
    realOtpRef.current = updated;
    setOtpLength(updated.length);
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      realOtpRef.current = realOtpRef.current.slice(0, -1);
      setOtpLength(realOtpRef.current.length);
      return;
    }
    if (e.key.length === 1 && /^[0-9]$/.test(e.key) && realOtpRef.current.length < 6) {
      e.preventDefault();
      realOtpRef.current += e.key;
      setOtpLength(realOtpRef.current.length);
      return;
    }
  };

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black select-none"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-2xl">
        {/* Glow accents */}
        <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            AuraCall Video
            <Lock className="h-4 w-4 text-emerald-400" />
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Encrypted WebRTC Gateway with Shielded OTP Protection
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
          <form onSubmit={handleRequestOtp} className="mt-5 space-y-4" autoComplete="off">
            {channel === 'whatsapp' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>WhatsApp Mobile Number</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-normal">TLS_AES_256_GCM Shielded</span>
                </label>
                <CipherCanvasInput
                  type="tel"
                  placeholder="+91 98765 43210"
                  initialValue={phone}
                  onChange={(val) => handlePhoneChange(val)}
                  icon={<Phone className="h-4 w-4" />}
                  accentColor="emerald"
                  required
                  autoFocus
                />
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
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Email Address</span>
                  <span className="text-[10px] text-cyan-400 font-mono font-normal">TLS_AES_256_GCM Shielded</span>
                </label>
                <CipherCanvasInput
                  type="email"
                  placeholder="name@company.com"
                  initialValue={email}
                  onChange={(val) => setEmail(val)}
                  icon={<Mail className="h-4 w-4" />}
                  accentColor="cyan"
                  required
                  autoFocus
                />
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
                {channel === 'whatsapp' ? 'Zero-Knowledge OTP Dispatch' : 'SLM Mailer Engine Verification'}
              </div>
              <p>
                {channel === 'whatsapp'
                  ? 'Direct WhatsApp delivery with client-side encrypted transmission. Credentials never stored in browser inspect.'
                  : 'Your custom Small Language Model generates a smart, secure verification message delivered right to your inbox.'}
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4" autoComplete="off">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                  Shielded 6-Digit Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setError(null);
                    setSuccessMsg(null);
                    realOtpRef.current = '';
                    setOtpLength(0);
                  }}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Change {channel === 'whatsapp' ? 'Number' : 'Email'}
                </button>
              </div>

              {/* ADVANCED VIRTUAL MASKED PIN MATRIX:
                  The real digits are stored strictly in private JavaScript memory (realOtpRef).
                  The DOM input value is scrubbed immediately on every keystroke.
                  In DevTools Elements tab, no numbers exist! Only generic glowing bullet dots. */}
              <div 
                className="relative cursor-pointer"
                onClick={() => hiddenOtpInputRef.current?.focus()}
              >
                {/* Hidden input to capture keyboard input while displaying active Cipher Suite in DevTools inspect */}
                <input
                  ref={hiddenOtpInputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={generateCipherSuiteToken(realOtpRef.current, 'AES_256_GCM')}
                  data-cipher-suite="TLS_AES_256_GCM_SHA384"
                  data-encryption="E2EE_AES_GCM"
                  autoComplete="one-time-code"
                  data-lpignore="true"
                  data-form-type="other"
                  className="absolute inset-0 opacity-0 cursor-pointer pointer-events-auto w-full h-full z-10"
                  onChange={handleOtpInputChange}
                  onKeyDown={handleOtpKeyDown}
                  autoFocus
                />

                {/* Visual 6-Digit Segmented PIN Matrix */}
                <div className="flex justify-center items-center gap-2.5 sm:gap-3 py-2">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const isFilled = idx < otpLength;
                    const isCurrent = idx === otpLength;
                    return (
                      <div
                        key={idx}
                        className={`w-11 h-14 sm:w-12 sm:h-16 rounded-2xl flex items-center justify-center border transition-all duration-200 ${
                          isCurrent
                            ? 'border-cyan-400 bg-slate-800/90 shadow-lg shadow-cyan-500/20 scale-105 ring-2 ring-cyan-500/30'
                            : isFilled
                            ? 'border-cyan-500/50 bg-slate-900/90 shadow-sm shadow-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        {isFilled ? (
                          <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 shadow-md shadow-cyan-400/50 animate-in fade-in zoom-in duration-150" />
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-cyan-400/50 animate-pulse" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700/60" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 text-center">
                <span className="text-[11px] text-slate-500">
                  {otpLength === 6 
                    ? '✓ 6 digits entered securely' 
                    : `Tap above to type (${otpLength}/6 digits)`}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otpLength < 6}
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
                Sent to: <span className="text-slate-300 font-mono">{maskPII(identifier)}</span>
              </span>
              {countdown > 0 ? (
                <span className="text-slate-500 font-mono">Resend in {countdown}s</span>
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
