import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components';
import { colors } from '@/theme/tokens';

export type AuthMethod = 'phone' | 'email';

type MethodTabsProps = {
  method: AuthMethod;
  onChange: (method: AuthMethod) => void;
  phoneLabel: string;
  emailLabel: string;
};

/** Phone / Email segmented control — picks which credential fields render below it. */
export function MethodTabs({ method, onChange, phoneLabel, emailLabel }: MethodTabsProps) {
  const items: { key: AuthMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
    [
      { key: 'phone', label: phoneLabel, icon: 'call' },
      { key: 'email', label: emailLabel, icon: 'mail-outline' },
    ];

  return (
    <View className="flex-row" style={{ gap: 10 }}>
      {items.map((item) => {
        const active = method === item.key;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            className={`h-touch flex-1 flex-row items-center justify-center rounded-field border ${
              active ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface'
            }`}
          >
            <View className="mr-2">
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.brand[700] : colors.ink.faint}
              />
            </View>
            <Text
              weight="medium"
              className={active ? 'text-body text-brand-700' : 'text-body text-ink-muted'}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
