import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, QrCode as QrIcon, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';

interface CodeDisplayProps {
  code: string;
  expiresAt: number | null;
  receiverDeviceName?: string;
  step: 'waiting_receiver' | 'receiver_request' | 'connecting';
  onAcceptReceiver: () => void;
  onDeclineReceiver: () => void;
  onCancel: () => void;
}

export function CodeDisplay({
  code,
  expiresAt,
  receiverDeviceName,
  step,
  onAcceptReceiver,
  onDeclineReceiver,
  onCancel,
}: CodeDisplayProps) {
  const { t } = useTranslation();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQr, setShowQr] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(600);

  // Formatted code with space: "482 019"
  const formattedCode =
    code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  // Generate QR data URL
  useEffect(() => {
    if (!code) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const linkUrl = `${origin}/r/${code}`;

    QRCode.toDataURL(linkUrl, {
      width: 160,
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR:', err));
  }, [code]);

  // Expiry Countdown
  useEffect(() => {
    if (!expiresAt) return;

    const updateRemaining = () => {
      const remainingMs = Math.max(0, expiresAt - Date.now());
      setSecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isWarningTime = secondsRemaining < 60;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(`${origin}/r/${code}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="flex flex-col items-center justify-between text-center space-y-5" data-testid="code-display">
      <div className="w-full">
        <p className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
          {t('codeDisplay.yourKey')}
        </p>

        {/* Giant Monospace Digits */}
        <div className="my-3 flex items-center justify-center">
          <button
            type="button"
            onClick={handleCopyCode}
            className="group relative inline-flex items-center justify-center px-4 py-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title={t('codeDisplay.copy')}
          >
            <span
              className="font-mono text-5xl sm:text-6xl font-extrabold tracking-widest text-[#0F172A] dark:text-[#E6EDF5] tabular-nums select-all"
              aria-label={code.split('').join(' ')}
              data-testid="display-code-digits"
            >
              {formattedCode}
            </span>
            <div className="ml-3 p-2 rounded-lg text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {copiedCode ? (
                <Check className="w-5 h-5 text-emerald-500 animate-in zoom-in" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </div>
          </button>
        </div>

        {/* Countdown Timer */}
        <div
          className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
            isWarningTime
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {t('codeDisplay.expiresIn', { time: timeFormatted })}
        </div>
      </div>

      {/* QR Code / Link Actions */}
      <div className="flex flex-col items-center gap-3 w-full">
        {showQr && qrDataUrl ? (
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <img
              src={qrDataUrl}
              alt={`QR code for transfer key ${code}`}
              className="w-40 h-40"
              data-testid="qr-code-image"
            />
            <p className="mt-1 text-[11px] font-medium text-slate-500">{t('codeDisplay.scanToReceive')}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <QrIcon className="w-3.5 h-3.5 mr-1.5" />
            {showQr ? 'Hide QR' : t('codeDisplay.scanToReceive')}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                {t('codeDisplay.copied')}
              </>
            ) : (
              <>
                <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                {t('codeDisplay.copyLink')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dynamic Status Line & Receiver Approval */}
      <div
        className="w-full min-h-[56px] flex flex-col items-center justify-center py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80"
        aria-live="polite"
        data-testid="status-line-container"
      >
        {step === 'waiting_receiver' && (
          <div className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 mr-2 rounded-full bg-blue-500 animate-pulse" />
            {t('codeDisplay.waiting')}
          </div>
        )}

        {step === 'receiver_request' && (
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full justify-between animate-in fade-in">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('codeDisplay.joinRequest', { name: receiverDeviceName || 'Device' })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAcceptReceiver}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                data-testid="sender-accept-receiver-btn"
              >
                {t('codeDisplay.accept')}
              </button>
              <button
                type="button"
                onClick={onDeclineReceiver}
                className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                data-testid="sender-decline-receiver-btn"
              >
                {t('codeDisplay.decline')}
              </button>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="flex items-center text-xs font-medium text-blue-600 dark:text-blue-400">
            <span className="w-3.5 h-3.5 mr-2 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            {t('codeDisplay.connecting')}
          </div>
        )}
      </div>

      {/* Cancel button & Footer Warning */}
      <div className="w-full flex flex-col items-center space-y-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          data-testid="cancel-code-btn"
        >
          {t('codeDisplay.cancel')}
        </button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {t('codeDisplay.keepOpen')}
        </p>
      </div>
    </div>
  );
}
