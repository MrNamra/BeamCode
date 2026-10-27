import { create } from 'zustand';
import en from './en.json';
import hi from './hi.json';
import gu from './gu.json';

export type Language = 'en' | 'hi' | 'gu';

const dictionaries: Record<Language, typeof en> = {
  en,
  hi,
  gu,
};

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const savedLang = (typeof localStorage !== 'undefined' &&
  (localStorage.getItem('beamcode_lang') as Language)) || 'en';

export const useI18nStore = create<I18nState>((set) => ({
  language: savedLang in dictionaries ? savedLang : 'en',
  setLanguage: (language: Language) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('beamcode_lang', language);
    }
    set({ language });
  },
}));

export function useTranslation() {
  const { language, setLanguage } = useI18nStore();
  const dict = dictionaries[language] || en;

  function t(path: string, params?: Record<string, string | number>): string {
    const keys = path.split('.');
    let current: unknown = dict;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        // Fallback to English
        let fallback: unknown = en;
        for (const k of keys) {
          if (fallback && typeof fallback === 'object' && k in fallback) {
            fallback = (fallback as Record<string, unknown>)[k];
          } else {
            return path;
          }
        }
        current = fallback;
        break;
      }
    }

    if (typeof current !== 'string') {
      return path;
    }

    if (!params) return current;

    return Object.entries(params).reduce((str, [k, v]) => {
      return str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    }, current);
  }

  return { t, language, setLanguage };
}
