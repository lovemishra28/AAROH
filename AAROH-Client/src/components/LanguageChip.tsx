import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';
import { useLangStore } from '@/store/langStore';

import { Text } from './Text';

/**
 * Persistent language toggle (globe + current language). Promotes the Hindi-default
 * requirement to a discoverable control on every screen that shows it. Tapping flips
 * hi ⇄ en, which re-renders all strings and switches the font script live.
 */
export function LanguageChip({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const toggle = useLangStore((s) => s.toggle);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={toggle}
      className={`h-9 flex-row items-center rounded-pill border border-line bg-surface px-3 ${
        className ?? ''
      }`}
    >
      <View className="mr-1.5">
        <Ionicons name="globe-outline" size={16} color={colors.brand[600]} />
      </View>
      <Text weight="medium" className="text-sm text-brand-700">
        {lang === 'hi' ? 'हिन्दी' : 'EN'}
      </Text>
    </Pressable>
  );
}
