import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './locales/en';
import { hi } from './locales/hi';

/**
 * i18n bootstrap (M1).
 *
 * Hindi is the default (`lng: 'hi'`), English the fallback. Import this module once, at
 * app start, before rendering. The active language is driven by the language store
 * (src/store/langStore.ts), which calls i18n.changeLanguage — keep those in sync there,
 * not here.
 *
 * `compatibilityJSON: 'v4'` is required so plurals work on Hermes/React Native, which
 * lacks the full Intl.PluralRules the default expects.
 */

export const DEFAULT_LANG = 'hi';
export const SUPPORTED_LANGS = ['hi', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: DEFAULT_LANG,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
