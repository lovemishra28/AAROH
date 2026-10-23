import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { useFields } from '@/api/fields';
import { useFieldRecommendations } from '@/api/recommendations';
import type { Field, Recommendation } from '@/api/types';
import { Card, EmptyState, LoadingState, Screen, SectionTitle, SyncBanner, Text } from '@/components';
import { colors } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

/**
 * Recommendations tab (formerly History) — every recommendation the farmer has generated,
 * grouped by field and newest-first within each. Advice is field-scoped on the server (no
 * global list endpoint), so we fan out one cached query per field; a tap reopens that saved
 * recommendation.
 *
 * Naming note: the tab route is `Recommendations` (plural) while the pushed result screen is
 * `Recommendation` (singular). The distinction is load-bearing — React Navigation resolves
 * `navigate()` against the nearest navigator first, so identical names would send a request
 * for a fresh recommendation to this list instead.
 */
type Nav = NativeStackNavigationProp<AppStackParamList>;

function topPick(rec: Recommendation, lang: string): string | null {
  const pick = rec.result.segment_a[0] ?? rec.result.segment_b[0] ?? null;
  if (!pick) return null;
  return lang === 'hi' ? pick.crop_hi : pick.crop;
}

function FieldAdviceGroup({ field, index }: { field: Field; index: number }) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { data: recs } = useFieldRecommendations(field.id);

  const items = recs ?? [];

  return (
    <View className="mt-5">
      <View className="flex-row items-center justify-between">
        <Text weight="semibold" className="flex-1 text-body-lg text-ink" numberOfLines={1}>
          {field.name || t('fields.autoLabel', { index })}
        </Text>
        <Text className="ml-2 text-sm text-ink-muted">
          {items.length > 0 ? t('history.adviceCount', { count: items.length }) : t('history.noAdviceYet')}
        </Text>
      </View>

      {items.map((rec) => {
        const pick = topPick(rec, i18n.language);
        return (
          <Pressable
            key={rec.id}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('Recommendation', {
                fieldId: field.id,
                fieldName: field.name ?? undefined,
                recommendationId: rec.id,
              })
            }
          >
            <Card className="mt-2 flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-pill bg-grow-50">
                <Ionicons name="sparkles-outline" size={18} color={colors.grow[600]} />
              </View>
              <View className="flex-1">
                <Text weight="medium" className="text-body text-ink" numberOfLines={1}>
                  {pick ? `${t('history.topPick')}: ${pick}` : t('recommendation.title')}
                </Text>
                <Text className="mt-0.5 text-sm text-ink-muted">
                  {t('history.generatedOn', { date: rec.created_at.slice(0, 10) })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.ink.faint} />
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RecommendationsScreen() {
  const { t } = useTranslation();
  const { data: fields, isLoading } = useFields();

  return (
    <Screen edges={['top']}>
      <SyncBanner />
      <View className="px-5 pt-3">
        <SectionTitle>{t('history.title')}</SectionTitle>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : !fields || fields.length === 0 ? (
        <EmptyState icon="time-outline" title={t('history.emptyTitle')} message={t('history.emptyMessage')} />
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
          {fields.map((field, index) => (
            <FieldAdviceGroup key={field.id} field={field} index={index + 1} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
