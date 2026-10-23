import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

import { Text } from './Text';

type StepRowProps = {
  index: number;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * Numbered guidance row from the reference's "3 Simple Steps": a green circular index,
 * an optional icon, and a title/subtitle. Used for form guidance (M5) and help (M7).
 */
export function StepRow({ index, title, subtitle, icon }: StepRowProps) {
  return (
    <View className="flex-row items-start py-2">
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-pill bg-brand-700">
        <Text weight="bold" className="text-sm text-white">
          {String(index)}
        </Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          {icon ? (
            <View className="mr-1.5">
              <Ionicons name={icon} size={16} color={colors.brand[600]} />
            </View>
          ) : null}
          <Text weight="semibold" className="text-body text-ink">
            {title}
          </Text>
        </View>
        {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
      </View>
    </View>
  );
}
