import { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, UploadCloud } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
}

export function DropZone({ onFilesSelected }: DropZoneProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  // Window paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        onFilesSelected(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFilesSelected]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-150 ${
        isDragOver
          ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 scale-[1.01]'
          : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-400 dark:hover:border-slate-600'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onFilesSelected(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        data-testid="file-input"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is a standard non-standard html prop
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onFilesSelected(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        data-testid="folder-input"
      />

      <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
        {isDragOver ? (
          <UploadCloud className="w-7 h-7 animate-bounce" />
        ) : (
          <Plus className="w-7 h-7" />
        )}
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
        data-testid="select-files-button"
      >
        {t('send.selectFiles')}
      </button>

      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {isDragOver ? t('send.dropToAdd') : t('send.dropHere')}
      </p>

      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 w-full flex justify-center">
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          className="inline-flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-2 py-1"
          data-testid="select-folder-button"
        >
          <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
          {t('send.selectFolder')}
        </button>
      </div>
    </div>
  );
}
