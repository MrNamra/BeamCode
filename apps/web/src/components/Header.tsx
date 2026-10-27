import { useTranslation } from '../i18n/index.js';
import { ThemeToggle } from './ThemeToggle.js';
import { LanguageSelect } from './LanguageSelect.js';
import { PwaInstallButton } from './PwaInstallButton.js';

interface HeaderProps {
  onNavigate?: (path: string) => void;
}

export function Header({ onNavigate }: HeaderProps) {
  const { t } = useTranslation();

  const handleLink = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full h-16 backdrop-blur-md bg-[#F3F6FB]/85 dark:bg-[#0F141B]/85 border-b border-[#E2E8F0] dark:border-[#2A3646] transition-colors">
      <div className="max-w-[960px] h-full mx-auto px-4 flex items-center justify-between">
        {/* Wordmark */}
        <a
          href="/"
          onClick={(e) => handleLink('/', e)}
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#0F172A] dark:text-[#E6EDF5] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg py-1"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-black text-sm">
            B
          </div>
          <span>BeamCode</span>
        </a>

        {/* Center / Right Links & Controls */}
        <div className="flex items-center gap-3 sm:gap-6">
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a
              href="/how-it-works"
              onClick={(e) => handleLink('/how-it-works', e)}
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md py-1"
            >
              {t('nav.howItWorks')}
            </a>
            <a
              href="/privacy"
              onClick={(e) => handleLink('/privacy', e)}
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md py-1"
            >
              {t('nav.privacy')}
            </a>
          </nav>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />

          <div className="flex items-center gap-2">
            <PwaInstallButton />
            <ThemeToggle />
            <LanguageSelect />
          </div>
        </div>
      </div>
    </header>
  );
}
