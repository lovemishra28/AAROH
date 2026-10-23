import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';

/**
 * Fonts (M1).
 *
 * Two families, one voice: Poppins for Latin, Noto Sans Devanagari for Hindi.
 * The design PDF used the proprietary Canva faces Agrandir/CanvaSans, which cannot ship;
 * Poppins is the closest free geometric substitute and was already embedded in the
 * reference. Noto Sans Devanagari renders complex conjuncts (क्ष, त्र, ज्ञ) and matras
 * correctly — we bundle it rather than trust the emulator's system fallback, which the
 * guide (§12) flags as unreliable.
 *
 * `fontFamily(weight, lang)` picks the script by the *active UI language*: when Hindi is
 * selected, all chrome uses Devanagari (numbers/Latin render fine within it); English
 * uses Poppins. Deterministic, and it flips live when the language chip toggles.
 */

export const fontAssets = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

const LATIN: Record<FontWeight, string> = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

const DEVANAGARI: Record<FontWeight, string> = {
  regular: 'NotoSansDevanagari_400Regular',
  medium: 'NotoSansDevanagari_500Medium',
  semibold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
};

export function fontFamily(weight: FontWeight, lang: string): string {
  return (lang === 'hi' ? DEVANAGARI : LATIN)[weight];
}
