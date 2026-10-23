import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline';

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Primary and secondary buttons from the reference. Both clear the 48dp touch floor
 * (`h-touch`) and show a spinner in the loading state so a slow OTP round-trip can't be
 * double-tapped. Primary = deep-green fill; secondary = white with a hairline border.
 */
export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  className,
  ...rest
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const inactive = disabled || loading;

  const container = [
    'h-touch flex-row items-center justify-center rounded-pill px-6',
    isPrimary ? 'bg-brand-700' : isOutline ? 'border-2 border-brand-600 bg-transparent' : 'border border-line bg-surface',
    inactive ? 'opacity-50' : '',
    className ?? '',
  ].join(' ');

  const labelClass = isPrimary ? 'text-body text-white' : isOutline ? 'text-body text-ink' : 'text-body text-brand-700';
  const iconColor = isPrimary ? colors.white : isOutline ? colors.ink.default : colors.brand[700];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      className={container}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <View className="flex-row items-center">
          {icon ? (
            <View className="mr-2">
              <Ionicons name={icon} size={20} color={iconColor} />
            </View>
          ) : null}
          <Text weight="semibold" className={labelClass}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
