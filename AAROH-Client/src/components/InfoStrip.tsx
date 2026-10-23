import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, verdictPalette, type Verdict } from '@/theme/tokens';

import { Text } from './Text';

type Tone = Verdict | 'info';

type InfoStripProps = {
  text: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * Light rounded strip carrying one line of plain guidance — the reference's "Make sure
 * your stick is powered on" affordance. This is the vehicle for provenance/honesty notes
 * ("NPK not yet calibrated") and for each `warning` in a RecommendationResult, so tone
 * spans the verdict triad plus a neutral info blue.
 */
export function InfoStrip({ text, tone = 'grow', icon }: InfoStripProps) {
  const palette =
    tone === 'info'
      ? { surface: colors.info[50], text: colors.info[600], solid: colors.info[500] }
      : verdictPalette[tone];

  const defaultIcon: keyof typeof Ionicons.glyphMap =
    tone === 'avoid'
      ? 'alert-circle'
      : tone === 'invest'
        ? 'wallet-outline'
        : tone === 'info'
          ? 'information-circle'
          : 'checkmark-circle';

  return (
    <View
      className="flex-row items-center rounded-field px-3 py-2.5"
      style={{ backgroundColor: palette.surface }}
    >
      <View className="mr-2">
        <Ionicons name={icon ?? defaultIcon} size={18} color={palette.solid} />
      </View>
      <Text className="flex-1 text-sm" style={{ color: palette.text }}>
        {text}
      </Text>
    </View>
  );
}
