import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';

type Edge = 'top' | 'bottom' | 'left' | 'right';

type ScreenProps = {
  children: ReactNode;
  edges?: Edge[];
  className?: string;
};

/**
 * Screen wrapper: safe-area insets + a consistent surface background.
 *
 * Uses `useSafeAreaInsets` on a plain View rather than <SafeAreaView className>, so all
 * styling stays in NativeWind's core-component path (SafeAreaView is a third-party
 * component and would need cssInterop registration to accept className reliably).
 */
export function Screen({ children, edges = ['top', 'bottom'], className = 'bg-surface' }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
  return (
    <View className={`flex-1 ${className}`} style={padding}>
      {children}
    </View>
  );
}

type SectionTitleProps = { children: ReactNode; className?: string };

export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <Text weight="semibold" className={`text-title text-brand-700 ${className ?? ''}`}>
      {children}
    </Text>
  );
}
