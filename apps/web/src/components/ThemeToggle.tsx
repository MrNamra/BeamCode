import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, Theme } from '../core/state/themeStore.js';

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();

  const nextTheme: Record<Theme, Theme> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };

  const icons: Record<Theme, typeof Sun> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const Icon = icons[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme[theme])}
      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`Current theme: ${theme}. Click to switch theme.`}
      title={`Theme: ${theme}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
