import { Download } from 'lucide-react';
import { usePwaStore } from '../core/pwa/pwaManager.js';
import { useTranslation } from '../i18n/index.js';

export function PwaInstallButton() {
  const { t } = useTranslation();
  const { canInstall, isInstalled, triggerInstall } = usePwaStore();

  if (!canInstall || isInstalled) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={triggerInstall}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-xs animate-in fade-in"
      data-testid="pwa-install-btn"
      title={t('pwa.install')}
      aria-label={t('pwa.install')}
    >
      <Download className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{t('pwa.install')}</span>
    </button>
  );
}
