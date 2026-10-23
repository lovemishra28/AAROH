import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

/**
 * A "Magic Eraser" style shimmer/sweep effect that animates horizontally over an element.
 */
export function Shimmer({
  width = Dimensions.get('window').width,
}: {
  width?: number | string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [-Number(width) || -300, Number(width) || 300]
    );

    return {
      transform: [{ translateX }, { skewX: '-20deg' }],
    };
  });

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', backgroundColor: 'rgba(230, 235, 240, 0.4)' }]}>
      <Animated.View
        style={[
          {
            width: '50%',
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            opacity: 0.8,
            shadowColor: '#fff',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 20,
            elevation: 5,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}
