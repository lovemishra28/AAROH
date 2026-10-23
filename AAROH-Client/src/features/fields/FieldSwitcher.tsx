import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { Field } from '@/api/types';
import { Text } from '@/components';
import { areaLabel, fieldLabel, fieldLabels } from '@/lib/fields';
import { colors } from '@/theme/tokens';

/**
 * The field switcher (Workstream 3).
 *
 * Automatic segregation turns "your field" into "your fields", possibly three of them
 * from a single sync, so the dashboard needs a way to say *which* plot the averages and
 * the map below belong to. A horizontal strip of pills was chosen over a dropdown for
 * two reasons: it shows how many fields exist without being opened, and it is one tap
 * rather than two — this control gets used constantly while comparing plots.
 *
 * Order is newest-detected first, so the plot the farmer has just walked is under their
 * thumb and already selected.
 */

type FieldSwitcherProps = {
  /** Newest first — pass the list already sorted (see `sortFieldsNewestFirst`). */
  fields: readonly Field[];
  /** The farmer's complete list, for stable numbering. Defaults to `fields`. */
  allFields?: readonly Field[];
  selectedId: string | null;
  onSelect: (fieldId: string) => void;
};

export function FieldSwitcher({ fields, allFields, selectedId, onSelect }: FieldSwitcherProps) {
  const { t } = useTranslation();

  // Numbering comes from every field the farmer has, never from the visible subset, so a
  // filtered or truncated strip still calls each plot by the name the rest of the app uses.
  const labels = useMemo(() => fieldLabels(allFields ?? fields, t), [allFields, fields, t]);

  if (fields.length === 0) return null;

  return (
    <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
      <Text weight="semibold" className="text-2xl text-ink mr-2">
        Field
      </Text>
      {fields.map((field, index) => {
        const selected = field.id === selectedId;
        return (
          <Pressable
            key={field.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(field.id)}
            className={`h-8 w-8 items-center justify-center rounded-full border ${
              selected ? 'border-brand-600 bg-brand-600' : 'border-ink bg-surface'
            }`}
          >
            <Text
              weight={selected ? 'bold' : 'semibold'}
              className={`text-sm ${selected ? 'text-white' : 'text-ink'}`}
            >
              {index + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
