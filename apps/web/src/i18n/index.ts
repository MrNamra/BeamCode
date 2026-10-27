import en from './en.json';

export type Language = 'en';

export function useTranslation() {
  function t(path: string, params?: Record<string, string | number>): string {
    const keys = path.split('.');
    let current: unknown = en;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return path;
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

  return { t, language: 'en' as const };
}
