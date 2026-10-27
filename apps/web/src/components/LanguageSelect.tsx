import { Globe } from 'lucide-react';
import { useTranslation, Language } from '../i18n/index.js';

export function LanguageSelect() {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="relative inline-flex items-center">
      <Globe className="w-4 h-4 mr-1 text-slate-500 dark:text-slate-400 pointer-events-none" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="appearance-none bg-transparent py-1 pl-1 pr-6 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
        aria-label="Select language"
      >
        <option value="en" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          English
        </option>
        <option value="hi" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          हिन्दी
        </option>
        <option value="gu" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          ગુજરાતી
        </option>
      </select>
    </div>
  );
}
