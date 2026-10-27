import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: Theme): boolean {
  if (typeof document === 'undefined') return false;
  const isDark = theme === 'system' ? getSystemPrefersDark() : theme === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  return isDark;
}

const initialTheme = (typeof localStorage !== 'undefined' &&
  (localStorage.getItem('beamcode_theme') as Theme)) || 'system';

export const useThemeStore = create<ThemeState>((set) => {
  const isDark = applyTheme(initialTheme);

  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = useThemeStore.getState().theme;
      if (current === 'system') {
        const dark = applyTheme('system');
        set({ isDark: dark });
      }
    });
  }

  return {
    theme: initialTheme,
    isDark,
    setTheme: (theme: Theme) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('beamcode_theme', theme);
      }
      const dark = applyTheme(theme);
      set({ theme, isDark: dark });
    },
  };
});
