import { useState, useEffect, useRef } from 'react';
import { Menu, X, Shield, Info } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';
import { ThemeToggle } from './ThemeToggle.js';
import { PwaInstallButton } from './PwaInstallButton.js';

interface HeaderProps {
  onNavigate?: (path: string) => void;
}

export function Header({ onNavigate }: HeaderProps) {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLink = (path: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Close mobile menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full h-16 backdrop-blur-md bg-[#F3F6FB]/90 dark:bg-[#0F141B]/90 border-b border-[#E2E8F0] dark:border-[#2A3646] transition-colors">
      <div className="max-w-[960px] h-full mx-auto px-3 sm:px-4 flex items-center justify-between">
        {/* Brand & Real SVG Logo */}
        <a
          href="/"
          onClick={(e) => handleLink('/', e)}
          className="flex items-center gap-2.5 text-lg sm:text-xl font-bold tracking-tight text-[#0F172A] dark:text-[#E6EDF5] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg py-1 shrink-0"
          data-testid="brand-link"
        >
          <img
            src="/icons/icon.svg"
            alt="BeamCode Logo"
            className="w-8 h-8 rounded-xl shadow-xs shrink-0"
          />
          <span className="font-extrabold tracking-tight">BeamCode</span>
        </a>

        {/* Right Section: Desktop Nav + Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Desktop Nav Links (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-400">
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

          <div className="hidden md:block h-4 w-px bg-slate-300 dark:bg-slate-700" />

          {/* Action buttons (Install, Theme) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <PwaInstallButton />
            <ThemeToggle />

            {/* Mobile Menu Hamburger Button (< md) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu Drawer */}
      {mobileMenuOpen && (
        <div
          ref={menuRef}
          className="md:hidden absolute top-16 left-0 right-0 bg-white/95 dark:bg-[#0F141B]/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 shadow-xl px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200"
          data-testid="mobile-menu-dropdown"
        >
          <div className="flex flex-col space-y-1">
            <button
              type="button"
              onClick={(e) => handleLink('/how-it-works', e)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left transition-colors"
            >
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t('nav.howItWorks')}</span>
            </button>
            <button
              type="button"
              onClick={(e) => handleLink('/privacy', e)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left transition-colors"
            >
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('nav.privacy')}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 dark:text-slate-500 text-center">
            BeamCode P2P · File Sharing
          </div>
        </div>
      )}
    </header>
  );
}
