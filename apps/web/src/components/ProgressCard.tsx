import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { ConnectionBadge } from './ConnectionBadge.js';
import { ConnectionType } from '../core/rtc/connectionType.js';
import { ProgressState, SelectedFileItem } from '../core/state/transferStore.js';
import { formatBytes, truncateMiddle, getFileIcon } from './FileList.js';
import { useTranslation } from '../i18n/index.js';

interface ProgressCardProps {
  title: string;
  progress: ProgressState;
  files: SelectedFileItem[];
  connectionType: ConnectionType | null;
  onCancel: () => void;
}

export function ProgressCard({
  title,
  progress,
  files,
  connectionType,
  onCancel,
}: ProgressCardProps) {
  const { t } = useTranslation();

  // Determine active file based on bytes transferred
  let accumulated = 0;
  let activeFileIndex = 0;
  for (let i = 0; i < files.length; i++) {
    accumulated += files[i]!.meta.size;
    if (progress.bytesDone < accumulated) {
      activeFileIndex = i;
      break;
    }
  }

  return (
    <div className="flex flex-col h-full space-y-5" data-testid="progress-card">
      {/* Header with Title and ConnectionBadge */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        <ConnectionBadge type={connectionType} />
      </div>

      {/* Progress Bar & Percentage */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-extrabold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
            {progress.percent}%
          </span>
          <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBytes(progress.bytesDone)} / {formatBytes(progress.totalBytes)}
          </span>
        </div>

        {/* Progress Track */}
        <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="progress-bar-fill"
          />
        </div>

        {/* Speed & ETA stats */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-400 pt-1">
          <span className="font-semibold tabular-nums" data-testid="transfer-speed-display">
            {progress.speedMBs} MB/s
          </span>
          <span className="tabular-nums" data-testid="transfer-eta-display">
            {t('progress.eta', { eta: progress.eta })}
          </span>
        </div>
      </div>

      {/* Per-file mini rows */}
      <div
        className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 pr-1 -mr-1"
        data-testid="progress-file-rows"
      >
        {files.map((item, idx) => {
          let statusIcon = <Clock className="w-4 h-4 text-slate-400" />;
          if (idx < activeFileIndex || progress.percent >= 100) {
            statusIcon = <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
          } else if (idx === activeFileIndex) {
            statusIcon = <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
          }

          return (
            <div
              key={`${item.meta.name}-${idx}`}
              className="flex items-center justify-between py-2 px-1 text-xs"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="flex-shrink-0">{getFileIcon(item.meta.mime, item.meta.name)}</div>
                <span
                  className="font-medium text-slate-700 dark:text-slate-300 truncate"
                  title={item.meta.name}
                >
                  {truncateMiddle(item.meta.name, 24)}
                </span>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <span className="text-[11px] font-mono text-slate-400">
                  {formatBytes(item.meta.size)}
                </span>
                {statusIcon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          data-testid="cancel-transfer-btn"
        >
          {t('progress.cancel')}
        </button>
      </div>
    </div>
  );
}
