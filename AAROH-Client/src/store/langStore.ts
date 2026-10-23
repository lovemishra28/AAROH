import { create } from 'zustand';

import i18n, { DEFAULT_LANG, type Lang } from '@/i18n';

/**
 * Language store (M1).
 *
 * Single source of truth for the active UI language. Setting it here also flips i18next
 * (so all strings re-render) and, because the Text component keys its font off the active
 * language, the whole app switches script live between Poppins and Noto Sans Devanagari.
 *
 * Persistence across app restarts is wired in M3, once expo-secure-store lands — for now
 * the choice resets to Hindi on reload. Hydration will call `setLang` with the stored
 * value at boot.
 */
type LangState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
};

export const useLangStore = create<LangState>()((set, get) => ({
  lang: DEFAULT_LANG,
  setLang: (lang) => {
    void i18n.changeLanguage(lang);
    set({ lang });
  },
  toggle: () => {
    const next: Lang = get().lang === 'hi' ? 'en' : 'hi';
    get().setLang(next);
  },
}));
