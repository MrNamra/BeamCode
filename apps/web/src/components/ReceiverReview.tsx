import { Folder, Archive, CheckSquare, Square } from 'lucide-react';
import { SelectedFileItem } from '../core/state/transferStore.js';
import { formatBytes, truncateMiddle, getFileIcon } from './FileList.js';
import { useTranslation } from '../i18n/index.js';
import { detectBrowserCapabilities } from '../core/util/capabilities.js';

interface ReceiverReviewProps {
  senderDeviceName?: string;
  files: SelectedFileItem[];
  saveAsZip: boolean;
  onToggleZip: (zip: boolean) => void;
  onToggleFile: (index: number) => void;
  onAccept: () => void;
  onDecline: () => void;
  isConnecting?: boolean;
}

export function ReceiverReview({
  senderDeviceName,
  files,
  saveAsZip,
  onToggleZip,
  onToggleFile,
  onAccept,
  onDecline,
  isConnecting,
}: ReceiverReviewProps) {
  const { t } = useTranslation();
  const caps = detectBrowserCapabilities();

  const checkedFiles = files.filter((f) => f.checked !== false);
  const totalBytes = checkedFiles.reduce((acc, f) => acc + f.meta.size, 0);
  const totalCount = checkedFiles.length;

  const titleString =
    totalCount === 1
      ? t('review.titleOne', {
          name: senderDeviceName || 'Sender',
          size: formatBytes(totalBytes),
        })
      : t('review.title', {
          name: senderDeviceName || 'Sender',
          count: totalCount,
          size: formatBytes(totalBytes),
        });

  return (
    <div className="flex flex-col h-full space-y-4" data-testid="receiver-review-card">
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
        {titleString}
      </h2>

      {/* File checklist */}
      <div
        className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1 -mr-1"
        data-testid="receiver-file-checklist"
      >
        {files.map((item, idx) => {
          const isChecked = item.checked !== false;
          return (
            <div
              key={`${item.meta.name}-${idx}`}
              onClick={() => onToggleFile(idx)}
              className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg cursor-pointer transition-colors select-none"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <button
                  type="button"
                  className="text-blue-600 dark:text-blue-400 focus:outline-none"
                  aria-label={isChecked ? `Deselect ${item.meta.name}` : `Select ${item.meta.name}`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                <div className="flex-shrink-0">{getFileIcon(item.meta.mime, item.meta.name)}</div>
                <div className="min-w-0">
                  <p
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate"
                    title={item.meta.name}
                  >
                    {truncateMiddle(item.meta.name, 22)}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatBytes(item.meta.size)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Options: ZIP toggle and Destination note */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        {files.length > 1 && (
          <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Archive className="w-4 h-4 mr-2 text-indigo-500" />
              {t('review.saveAsZip')}
            </span>
            <input
              type="checkbox"
              checked={saveAsZip}
              onChange={(e) => onToggleZip(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              data-testid="save-as-zip-toggle"
            />
          </label>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span className="flex items-center">
            <Folder className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            {t('review.streamDirect')}
          </span>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {caps.hasFileSystemAccess
              ? t('gating.fsAccess')
              : caps.hasServiceWorker
              ? t('gating.serviceWorker')
              : t('gating.memory')}
          </span>
        </div>
      </div>

      {/* Accept & Decline Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onDecline}
          disabled={isConnecting}
          className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          data-testid="receiver-decline-btn"
        >
          {t('review.decline')}
        </button>

        <button
          type="button"
          onClick={onAccept}
          disabled={checkedFiles.length === 0 || isConnecting}
          className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.99] flex items-center justify-center"
          data-testid="receiver-accept-btn"
        >
          {isConnecting ? (
            <span className="inline-flex items-center">
              <span className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('codeDisplay.connecting')}
            </span>
          ) : (
            t('review.accept')
          )}
        </button>
      </div>
    </div>
  );
}
