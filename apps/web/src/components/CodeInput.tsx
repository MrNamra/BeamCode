import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { useTranslation } from '../i18n/index.js';

interface CodeInputProps {
  initialCode?: string;
  onSubmit: (code: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function CodeInput({
  initialCode = '',
  onSubmit,
  isLoading,
  errorMessage,
}: CodeInputProps) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState<string[]>(() => {
    const clean = initialCode.replace(/\D/g, '').slice(0, 6);
    const arr = clean.split('');
    while (arr.length < 6) arr.push('');
    return arr;
  });

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-submit if initialCode is provided and exactly 6 digits
  useEffect(() => {
    const clean = initialCode.replace(/\D/g, '').slice(0, 6);
    if (clean.length === 6) {
      onSubmit(clean);
    }
  }, [initialCode, onSubmit]);

  const handleChange = (index: number, val: string) => {
    const sanitized = val.replace(/\D/g, '');
    if (!sanitized) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const next = [...digits];
    // If user typed or pasted single char
    next[index] = sanitized[sanitized.length - 1]!;
    setDigits(next);

    // Focus next input
    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // Check if all 6 digits are complete
    const fullCode = next.join('');
    if (fullCode.length === 6) {
      onSubmit(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
      } else {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setDigits(next);

    const focusIdx = Math.min(5, pasted.length);
    inputsRef.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      onSubmit(pasted);
    }
  };

  const handleExplicitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = digits.join('');
    if (fullCode.length === 6) {
      onSubmit(fullCode);
    }
  };

  const isComplete = digits.join('').length === 6;

  return (
    <form onSubmit={handleExplicitSubmit} className="flex flex-col items-center space-y-6">
      <div className="w-full text-center">
        <label
          htmlFor="digit-input-0"
          className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-4"
        >
          {t('receive.enterKey')}
        </label>

        {/* Six Single-digit Slots */}
        <div className="flex items-center justify-center gap-2 sm:gap-3" data-testid="code-input-group">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`digit-input-${idx}`}
              ref={(el) => {
                inputsRef.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              disabled={isLoading}
              className="w-11 h-14 sm:w-13 sm:h-16 text-center text-2xl sm:text-3xl font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all disabled:opacity-50"
              aria-label={`Digit ${idx + 1}`}
              data-testid={`code-digit-${idx}`}
            />
          ))}
        </div>

        {/* Error message under boxes */}
        {errorMessage && (
          <div
            className="mt-4 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 animate-in fade-in"
            role="alert"
            aria-live="polite"
            data-testid="receive-error-message"
          >
            {errorMessage}
          </div>
        )}
      </div>

      {/* Explicit Receive Button */}
      <button
        type="submit"
        disabled={!isComplete || isLoading}
        className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-base shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.99] flex items-center justify-center"
        data-testid="receive-submit-button"
      >
        {isLoading ? (
          <span className="inline-flex items-center">
            <span className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('receive.connecting')}
          </span>
        ) : (
          t('receive.button')
        )}
      </button>
    </form>
  );
}
