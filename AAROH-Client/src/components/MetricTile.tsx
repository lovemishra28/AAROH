import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';

import { colors, verdictPalette, type Verdict } from '@/theme/tokens';

import { Text } from './Text';

type MetricTileProps = {
  label: string;
  value: string;
  unit?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tints the icon badge to carry a grow/invest/avoid reading. */
  verdict?: Verdict;
  className?: string;
  compact?: boolean;
  isLoading?: boolean;
};

/**
 * Small metric card from the reference dashboard: label, pastel icon badge, a large bold
 * value with a small unit, all in a bordered white tile. This is the pattern the M5 form
 * review and the M6 recommendation soil bands reuse, so it lives in the shared kit now.
 */
export function MetricTile({
  label,
  value,
  unit,
  icon = 'leaf-outline',
  verdict,
  className,
  compact = false,
  isLoading = false,
}: MetricTileProps) {
  const badge = verdict ? verdictPalette[verdict] : null;
  const badgeBg = badge?.surface ?? colors.brand[50];
  const badgeFg = badge?.solid ?? colors.brand[600];

  const scale = useSharedValue(1);

  useEffect(() => {
    if (isLoading) {
      scale.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [isLoading, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: isLoading ? 0.7 : 1,
  }));

  return (
    <Animated.View style={animatedStyle} className={`rounded-card border border-ink bg-surface flex-col justify-between overflow-hidden ${compact ? 'p-3' : 'p-4'} ${className ?? ''}`}>
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
           {/* Skeleton loader state */}
        </View>
      ) : (
        <>
          <View className="flex-row items-start justify-between">
            <Text className={`${compact ? 'text-xs' : 'text-sm'} text-ink-muted flex-1 pr-1`} numberOfLines={compact ? 2 : 1}>
              {label}
            </Text>
            <View
              className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} items-center justify-center rounded-pill flex-shrink-0`}
              style={{ backgroundColor: badgeBg }}
            >
              <Ionicons name={icon} size={compact ? 12 : 16} color={badgeFg} />
            </View>
          </View>
          <View className={`${compact ? 'mt-1' : 'mt-2'} flex-row items-baseline flex-wrap`}>
            <Text weight="bold" className={`${compact ? 'text-3xl' : 'text-5xl'} text-ink`} numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
            {unit ? <Text className={`ml-1 ${compact ? 'text-[10px]' : 'text-sm'} text-ink-muted`} numberOfLines={1}>{unit}</Text> : null}
          </View>
        </>
      )}
    </Animated.View>
  );
}
