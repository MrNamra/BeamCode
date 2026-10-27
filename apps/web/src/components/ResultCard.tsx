import { CheckCircle2, Clock, XCircle, AlertTriangle, Info, WifiOff } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';

export type ResultType =
  | 'completed_sender'
  | 'completed_receiver'
  | 'expired'
  | 'declined'
  | 'failed'
  | 'cant_connect'
  | 'unsupported';

interface ResultCardProps {
  type: ResultType;
  fileCount?: number;
  errorMessage?: string | null;
  onAction: () => void;
}

export function ResultCard({ type, fileCount = 1, errorMessage, onAction }: ResultCardProps) {
  const { t } = useTranslation();

  let icon = <CheckCircle2 className="w-16 h-16 text-emerald-500" />;
  let title = t('results.completedSender');
  let actionLabel = t('results.sendMore');
  let details: React.ReactNode = null;

  if (type === 'completed_sender') {
    icon = <CheckCircle2 className="w-16 h-16 text-emerald-500" />;
    title = t('results.completedSender');
    actionLabel = t('results.sendMore');
  } else if (type === 'completed_receiver') {
    icon = <CheckCircle2 className="w-16 h-16 text-emerald-500" />;
    title =
      fileCount === 1
        ? t('results.completedReceiverOne')
        : t('results.completedReceiver', { count: fileCount });
    actionLabel = t('results.receiveAnother');
  } else if (type === 'expired') {
    icon = <Clock className="w-16 h-16 text-amber-500" />;
    title = t('results.expired');
    actionLabel = t('results.newKey');
  } else if (type === 'declined') {
    icon = <XCircle className="w-16 h-16 text-slate-400" />;
    title = t('results.declined');
    actionLabel = t('results.tryAgain');
  } else if (type === 'failed') {
    icon = <AlertTriangle className="w-16 h-16 text-rose-500" />;
    title = t('results.failed');
    actionLabel = t('results.tryAgain');
    if (errorMessage) {
      details = (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-mono bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg">
          {errorMessage}
        </p>
      );
    }
  } else if (type === 'cant_connect') {
    icon = <WifiOff className="w-16 h-16 text-amber-500" />;
    title = t('results.cantConnect');
    actionLabel = t('results.tryAgain');
    details = (
      <div className="mt-3 text-left p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
        <p className="font-semibold">{t('results.troubleshootingTitle')}</p>
        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
          <li>{t('results.troubleshoot1')}</li>
          <li>{t('results.troubleshoot2')}</li>
        </ul>
      </div>
    );
  } else if (type === 'unsupported') {
    icon = <Info className="w-16 h-16 text-blue-500" />;
    title = t('results.unsupported');
    actionLabel = '';
  }

  return (
    <div
      className="flex flex-col items-center justify-center text-center py-6 px-4 space-y-5 animate-in fade-in"
      data-testid="result-card"
    >
      <div className="p-3 rounded-full bg-slate-50 dark:bg-slate-800/60">{icon}</div>

      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        {details}
      </div>

      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.99]"
          data-testid="result-action-btn"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
