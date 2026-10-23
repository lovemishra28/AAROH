import { type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

import { Text } from './Text';

type InputProps = TextInputProps & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Trailing content: a unit suffix ("acres", "dS/m"), an eye toggle, etc. */
  trailing?: ReactNode;
  error?: string | null;
  className?: string;
};

/**
 * The reference's field style: white, rounded, hairline border, a leading icon *inside*
 * the field, muted placeholder, and an optional trailing affordance. Error text renders
 * beneath in the `avoid` colour. The field itself clears the 48dp touch floor.
 */
export function Input({
  label,
  icon,
  trailing,
  error,
  className,
  ...rest
}: InputProps) {
  return (
    <View className={className}>
      {label ? (
        <Text weight="medium" className="mb-1.5 text-body text-ink">
          {label}
        </Text>
      ) : null}
      <View
        className={`h-touch flex-row items-center rounded-field border bg-surface px-3 ${
          error ? 'border-avoid-500' : 'border-line'
        }`}
      >
        {icon ? (
          <View className="mr-2">
            <Ionicons name={icon} size={20} color={colors.ink.faint} />
          </View>
        ) : null}
        <TextInput
          className="flex-1 text-body text-ink"
          placeholderTextColor={colors.ink.faint}
          style={{ fontFamily: 'Poppins_400Regular' }}
          {...rest}
        />
        {trailing ? <View className="ml-2">{trailing}</View> : null}
      </View>
      {error ? (
        <Text className="mt-1 text-sm text-avoid-600">{error}</Text>
      ) : null}
    </View>
  );
}
