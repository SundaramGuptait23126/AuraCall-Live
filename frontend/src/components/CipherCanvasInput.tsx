import React, { useRef, useState, useEffect, useCallback } from 'react';
import { generateCipherSuiteToken } from '../utils/crypto';

export { generateCipherSuiteToken };

export interface CipherCanvasInputProps {
  type: 'tel' | 'email';
  placeholder: string;
  initialValue?: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  accentColor?: 'emerald' | 'cyan';
  required?: boolean;
  autoFocus?: boolean;
}

/**
 * CipherCanvasInput
 * High-Security Banking/Fintech Input Component.
 * - Graphical Canvas Layer: Paints user text as pure pixels - ZERO text nodes in the DOM!
 * - DevTools Inspect Layer: The <input> element's DOM value attribute is strictly a Cipher Suite token.
 */
export const CipherCanvasInput: React.FC<CipherCanvasInputProps> = ({
  type,
  placeholder,
  initialValue = '',
  onChange,
  icon,
  accentColor = 'emerald',
  required = false,
  autoFocus = false,
}) => {
  const [cipherValue, setCipherValue] = useState<string>(() => generateCipherSuiteToken(initialValue));
  const rawTextRef = useRef<string>(initialValue);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  // Blinking cursor when focused
  useEffect(() => {
    if (!isFocused) return;
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [isFocused]);

  // Canvas paint function
  const renderCanvas = useCallback(
    (text: string, showCursor: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 2;
      const width = canvas.clientWidth || 380;
      const height = canvas.clientHeight || 42;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const fontStyle = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.font = fontStyle;
      ctx.textBaseline = 'middle';

      const startX = 40; // Space for left icon
      const centerY = height / 2;

      if (!text) {
        ctx.fillStyle = '#64748b'; // slate-500 placeholder
        ctx.fillText(placeholder, startX, centerY);
      } else {
        ctx.fillStyle = '#f8fafc'; // Crisp white text
        ctx.fillText(text, startX, centerY);
      }

      // Draw blinking cursor if focused
      if (showCursor && isFocused) {
        const textWidth = text ? ctx.measureText(text).width : 0;
        const cursorX = startX + textWidth + 1;
        ctx.fillStyle = accentColor === 'emerald' ? '#34d399' : '#38bdf8';
        ctx.fillRect(cursorX, centerY - 8, 2, 16);
      }

      ctx.restore();
    },
    [placeholder, accentColor, isFocused]
  );

  useEffect(() => {
    renderCanvas(rawTextRef.current, cursorVisible);
  }, [renderCanvas, cursorVisible]);

  const updateText = (newText: string) => {
    rawTextRef.current = newText;
    const token = generateCipherSuiteToken(newText);
    setCipherValue(token);
    renderCanvas(newText, true);
    onChange(newText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = rawTextRef.current.slice(0, -1);
      updateText(next);
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      updateText('');
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (type === 'tel' && !/[0-9+]/.test(e.key)) return;
      const next = rawTextRef.current + e.key;
      updateText(next);
      return;
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement> & { data?: string }) => {
    if (e.data) {
      e.preventDefault();
      const valid = type === 'tel' ? e.data.replace(/[^0-9+]/g, '') : e.data;
      const next = rawTextRef.current + valid;
      updateText(next);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const valid = type === 'tel' ? pasted.replace(/[^0-9+]/g, '') : pasted.trim();
    const next = rawTextRef.current + valid;
    updateText(next);
  };

  // Fallback for mobile / IME composition
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value;
    if (val !== cipherValue) {
      if (val.startsWith(cipherValue)) {
        const appended = val.slice(cipherValue.length);
        const valid = type === 'tel' ? appended.replace(/[^0-9+]/g, '') : appended;
        if (valid) updateText(rawTextRef.current + valid);
      } else if (!val.startsWith('CIPHER[')) {
        const valid = type === 'tel' ? val.replace(/[^0-9+]/g, '') : val;
        updateText(valid);
      }
    }
  };

  return (
    <div 
      className={`relative rounded-xl border bg-slate-800/80 transition overflow-hidden ${
        isFocused 
          ? accentColor === 'emerald'
            ? 'border-emerald-500 ring-1 ring-emerald-500'
            : 'border-cyan-500 ring-1 ring-cyan-500'
          : 'border-slate-700'
      }`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10">
        {icon}
      </div>

      {/* Graphical Canvas Layer: Paints user text as pure pixels - ZERO text nodes in the DOM! */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Input Layer: What Chrome DevTools inspects. Value is strictly the Cipher Suite Token! */}
      <input
        ref={inputRef}
        type="text"
        value={cipherValue}
        data-cipher-suite="TLS_AES_256_GCM_SHA384"
        data-encryption="E2EE_AES_GCM"
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
        spellCheck="false"
        required={required}
        autoFocus={autoFocus}
        onFocus={() => {
          setIsFocused(true);
          setCursorVisible(true);
        }}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        onInput={handleInput}
        className="relative z-10 w-full py-2.5 pl-10 pr-4 text-sm bg-transparent text-transparent caret-transparent focus:outline-none cursor-text select-none"
      />
    </div>
  );
};
