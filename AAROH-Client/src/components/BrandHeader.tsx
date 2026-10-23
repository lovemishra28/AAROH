import { Image, View } from 'react-native';

import { Text } from './Text';

type BrandHeaderProps = {
  /** Optional status line beneath the wordmark, e.g. "● Connected". */
  status?: string;
  statusTone?: 'ok' | 'muted';
  className?: string;
};

/**
 * Centred AgroPulse wordmark, optionally with a status line. The logo is the supplied
 * artwork (never re-typed): the orange Devanagari "एग्रो" plus the green "Pulse" script
 * and pulse-line flourish.
 */
export function BrandHeader({ status, statusTone = 'muted', className }: BrandHeaderProps) {
  return (
    <View className={`items-center ${className ?? ''}`}>
      <Image
        source={require('../../assets/images/logo.png')}
        className="h-12 w-44"
        resizeMode="contain"
      />
      {status ? (
        <Text
          weight="medium"
          className={`mt-1 text-sm ${statusTone === 'ok' ? 'text-grow-600' : 'text-ink-muted'}`}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}
