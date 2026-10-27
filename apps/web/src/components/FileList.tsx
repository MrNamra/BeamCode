import { FileText, Image, Video, Music, Archive, File as FileIcon, X, Plus } from 'lucide-react';
import { SelectedFileItem } from '../core/state/transferStore.js';
import { useTranslation } from '../i18n/index.js';

interface FileListProps {
  files: SelectedFileItem[];
  onRemove: (index: number) => void;
  onAddMore: () => void;
  onSend: () => void;
  isSending?: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function truncateMiddle(str: string, maxLength = 26): string {
  if (str.length <= maxLength) return str;
  const part = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, part)}…${str.slice(-part)}`;
}

export function getFileIcon(mime: string, name: string) {
  const lowerName = name.toLowerCase();
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lowerName)) {
    return <Image className="w-5 h-5 text-purple-500" />;
  }
  if (mime.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi)$/i.test(lowerName)) {
    return <Video className="w-5 h-5 text-rose-500" />;
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(lowerName)) {
    return <Music className="w-5 h-5 text-amber-500" />;
  }
  if (
    mime.includes('zip') ||
    mime.includes('tar') ||
    mime.includes('compressed') ||
    /\.(zip|tar|gz|rar|7z)$/i.test(lowerName)
  ) {
    return <Archive className="w-5 h-5 text-indigo-500" />;
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('pdf') ||
    mime.includes('json') ||
    /\.(pdf|txt|md|js|ts|json|html|css|py)$/i.test(lowerName)
  ) {
    return <FileText className="w-5 h-5 text-blue-500" />;
  }
  return <FileIcon className="w-5 h-5 text-slate-500" />;
}

export function FileList({ files, onRemove, onAddMore, onSend, isSending }: FileListProps) {
  const { t } = useTranslation();

  const totalBytes = files.reduce((acc, f) => acc + f.meta.size, 0);
  const totalCount = files.length;
  const isLargeTransfer = totalBytes > 2 * 1024 * 1024 * 1024; // > 2 GB

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* File items list */}
      <div
        className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1 -mr-1"
        data-testid="file-list-items"
      >
        {files.map((item, idx) => (
          <div
            key={`${item.meta.name}-${idx}`}
            className="flex items-center justify-between py-2.5 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg group transition-colors"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="flex-shrink-0">{getFileIcon(item.meta.mime, item.meta.name)}</div>
              <div className="min-w-0">
                <p
                  className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate"
                  title={item.meta.name}
                >
                  {truncateMiddle(item.meta.name)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatBytes(item.meta.size)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              aria-label={`Remove ${item.meta.name}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Summary footer & Add more */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
        <span>
          {totalCount === 1
            ? t('send.oneFileCount', { size: formatBytes(totalBytes) })
            : t('send.filesCount', { count: totalCount, size: formatBytes(totalBytes) })}
        </span>
        <button
          type="button"
          onClick={onAddMore}
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t('send.addMore')}
        </button>
      </div>

      {/* Soft warning for > 2 GB */}
      {isLargeTransfer && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
          {t('send.mobileWarning')}
        </div>
      )}

      {/* Primary Send Button */}
      <button
        type="button"
        onClick={onSend}
        disabled={files.length === 0 || isSending}
        className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-base shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.99] flex items-center justify-center"
        data-testid="send-action-button"
      >
        {isSending ? (
          <span className="inline-flex items-center">
            <span className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('codeDisplay.connecting')}
          </span>
        ) : (
          t('send.sendButton')
        )}
      </button>
    </div>
  );
}
