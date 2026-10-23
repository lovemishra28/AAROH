import { Pressable, View } from 'react-native';

import { Text } from '@/components';

export type AuthMode = 'login' | 'signup';

type AuthTabsProps = {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
  loginLabel: string;
  signUpLabel: string;
};

/** Login / Sign Up segmented control — the top-level switch on the auth landing screen. */
export function AuthTabs({ mode, onChange, loginLabel, signUpLabel }: AuthTabsProps) {
  const items: { key: AuthMode; label: string }[] = [
    { key: 'login', label: loginLabel },
    { key: 'signup', label: signUpLabel },
  ];

  return (
    <View className="flex-row rounded-pill bg-surface-sunken p-1">
      {items.map((item) => {
        const active = mode === item.key;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            className={`h-touch flex-1 items-center justify-center rounded-pill ${
              active ? 'bg-brand-700' : ''
            }`}
          >
            <Text
              weight="semibold"
              className={active ? 'text-body text-white' : 'text-body text-ink-muted'}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
