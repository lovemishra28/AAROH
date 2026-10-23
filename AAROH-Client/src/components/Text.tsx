import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fontFamily, type FontWeight } from '@/theme/fonts';

export type TextProps = RNTextProps & {
  weight?: FontWeight;
  className?: string;
};

/**
 * The one Text primitive the whole app uses. It applies the correct font family for the
 * active language (Poppins vs Noto Sans Devanagari) and nothing else — size and colour
 * come from `className`, so callers stay in the Tailwind vocabulary.
 *
 * Why fontFamily goes through `style`, not className: NativeWind can drive font-family,
 * but resolving weight × script to a concrete registered family name is clearer in one
 * place than as a matrix of utility classes. Colour/size are deliberately NOT set in
 * style so a caller's className always wins.
 */
export function Text({ weight = 'regular', className, style, ...rest }: TextProps) {
  const { i18n } = useTranslation();
  return (
    <RNText
      className={className ?? 'text-body text-ink'}
      style={[{ fontFamily: fontFamily(weight, i18n.language) }, style]}
      {...rest}
    />
  );
}
