import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

import { Text } from './Text';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Shows a back chevron when provided. */
  onBack?: () => void;
  /** Optional trailing control (language chip, action icon, …). */
  right?: ReactNode;
};

/**
 * In-screen header used by the pushed stack screens (field detail, reading, advice).
 * We render our own rather than the native nav header so the title uses the active-language
 * font and the back affordance clears the 48dp touch floor.
 */
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  return (
    <View className="px-5 pb-1 pt-2">
      <View className="h-touch flex-row items-center">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            hitSlop={8}
            className="-ml-2 mr-1 h-touch w-touch items-center justify-center"
          >
            <Ionicons name="chevron-back" size={26} color={colors.brand[700]} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text weight="bold" className="text-title text-brand-700" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ? <View className="ml-2">{right}</View> : null}
      </View>
      {subtitle ? (
        <Text className="mt-0.5 text-body text-ink-muted">{subtitle}</Text>
      ) : null}
    </View>
  );
}
