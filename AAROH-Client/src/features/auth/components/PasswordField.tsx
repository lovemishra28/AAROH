import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Input } from '@/components';
import { passwordStrength } from '@/lib/validators';
import { colors } from '@/theme/tokens';

type PasswordFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  showStrength?: boolean;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
};

const STRENGTH_ORDER = { weak: 0, fair: 1, strong: 2 } as const;

/** Password input with a show/hide toggle, and an optional 3-bar strength meter. */
export function PasswordField({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  showStrength = false,
  returnKeyType,
  onSubmitEditing,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength && value.length > 0 ? passwordStrength(value) : null;

  return (
    <View>
      <Input
        label={label}
        icon="lock-closed-outline"
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete="password"
        error={error}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        trailing={
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setVisible((v) => !v)}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.ink.faint}
            />
          </Pressable>
        }
      />
      {strength ? (
        <View className="mt-1.5 flex-row" style={{ gap: 4 }}>
          {(['weak', 'fair', 'strong'] as const).map((level) => {
            const filled = STRENGTH_ORDER[level] <= STRENGTH_ORDER[strength];
            const color =
              strength === 'weak'
                ? colors.avoid[500]
                : strength === 'fair'
                  ? colors.invest[500]
                  : colors.grow[500];
            return (
              <View
                key={level}
                className="h-1.5 flex-1 rounded-pill"
                style={{ backgroundColor: filled ? color : colors.line.soft }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
