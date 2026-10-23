import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components';
import { colors } from '@/theme/tokens';

type GoogleButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * "Continue with Google" — white pill, brand-green hairline border, matching the
 * reference. The glyph is Ionicons' single-colour Google mark; swap in Google's official
 * multicolour lockup asset here if pixel-exact brand compliance is required later.
 */
export function GoogleButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: GoogleButtonProps) {
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={`h-touch flex-row items-center justify-center rounded-pill border border-brand-600 bg-surface ${
        inactive ? 'opacity-50' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color={colors.brand[700]} />
      ) : (
        <View className="flex-row items-center">
          <View className="mr-2.5">
            <Ionicons name="logo-google" size={20} color="#4285F4" />
          </View>
          <Text weight="semibold" className="text-body text-brand-700">
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
