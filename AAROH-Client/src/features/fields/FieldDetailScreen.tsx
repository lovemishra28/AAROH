import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useField } from '@/api/fields';
import { useFieldRecommendations } from '@/api/recommendations';
import {
  Button,
  Card,
  ErrorState,
  InfoStrip,
  LoadingState,
  MetricTile,
  Screen,
  ScreenHeader,
  SyncBanner,
  Text,
} from '@/components';
import { HEAT_METRICS, areaLabel, fieldLabel, formatMetric, readingMetric } from '@/lib/fields';
import { formatDateTime } from '@/lib/format';
import { colors } from '@/theme/tokens';
import type { AppScreenProps } from '@/navigation/types';

import { FieldHeatCard } from './FieldHeatCard';

/**
 * Field detail (M4, extended for segregation) — the hub for one plot. It shows the area and
 * provenance, the latest soil reading as a tile grid, the fertility map for the whole plot,
 * and the two next actions: enter a reading by hand or get advice. Past advice is listed
 * beneath, each row reopening that saved recommendation.
 *
 * Units and labels come from `lib/fields`, the same table the dashboard and the map read, so
 * this screen cannot show EC in different units from the tile two screens back.
 */

export function FieldDetailScreen({ route, navigation }: AppScreenProps<'FieldDetail'>) {
  const { t, i18n } = useTranslation();
  const { fieldId, fieldName } = route.params;
  const { data, isLoading, isError, error, refetch } = useField(fieldId);
  const { data: recs } = useFieldRecommendations(fieldId);

  // The caller passes the label it displayed, so a numbered auto-field keeps its number here.
  const title = fieldName ?? (data ? fieldLabel(data.field, t) : t('fields.title'));
  const goReading = () => navigation.navigate('ManualReading', { fieldId, fieldName: title });
  const goAdvice = () => navigation.navigate('Recommendation', { fieldId, fieldName: title });

  const reading = data?.latest_reading ?? null;

  return (
    <Screen>
      <SyncBanner />
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
          <Card>
            <Text className="text-sm text-ink-muted">{t('fieldDetail.area')}</Text>
            <Text weight="semibold" className="mt-0.5 text-body-lg text-ink">
              {areaLabel(data.field, t)}
            </Text>
            {/* Where this field came from. A boundary the farmer never drew needs saying so —
                otherwise an auto-detected plot looks like one they forgot creating. */}
            {data.field.source === 'auto' ? (
              <View className="mt-2 flex-row items-center">
                <Ionicons name="locate" size={13} color={colors.brand[600]} />
                <Text className="ml-1.5 flex-1 text-xs text-ink-faint" numberOfLines={1}>
                  {t('fields.autoDetected')}
                  {data.field.detected_at
                    ? ` · ${t('fields.detectedOn', { date: formatDateTime(data.field.detected_at) })}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {data.field.aggregate && data.field.aggregate.reading_count > 0 ? (
              <Text className="mt-1 text-xs text-ink-faint">
                {t('fields.readings', { count: data.field.aggregate.reading_count })}
              </Text>
            ) : null}
          </Card>

          <Text weight="semibold" className="mb-2 mt-6 text-title text-brand-700">
            {t('fieldDetail.latestReading')}
          </Text>

          {reading ? (
            <>
              <View className="flex-row flex-wrap justify-between">
                {HEAT_METRICS.map((metric) => {
                  const value = readingMetric(reading, metric);
                  if (value === null) return null;
                  return (
                    <View key={metric.id} style={{ width: '48%', marginBottom: 12 }}>
                      <MetricTile
                        label={t(metric.labelKey)}
                        value={formatMetric(value, metric)}
                        unit={metric.unit}
                        icon={metric.icon}
                      />
                    </View>
                  );
                })}
              </View>

              <InfoStrip tone="info" text={t('fieldDetail.calibrationNote')} />

              {/* The map earns its place here rather than only on the dashboard: this is the
                  screen reached from a sync report, and "which part of the plot" is the first
                  question after "how much on average". */}
              <FieldHeatCard field={data.field} className="mt-4" />

              <Button label={t('fieldDetail.getAdvice')} icon="sparkles-outline" className="mt-6" onPress={goAdvice} />
              <Button
                label={t('fieldDetail.enterReading')}
                icon="create-outline"
                variant="secondary"
                className="mt-3"
                onPress={goReading}
              />
            </>
          ) : (
            <Card>
              <Text weight="semibold" className="text-body-lg text-ink">
                {t('fieldDetail.noReadingTitle')}
              </Text>
              <Text className="mt-1 text-body text-ink-muted">{t('fieldDetail.noReadingMessage')}</Text>
              <Button
                label={t('fieldDetail.enterReading')}
                icon="create-outline"
                className="mt-4"
                onPress={goReading}
              />
            </Card>
          )}

          {recs && recs.length > 0 ? (
            <View className="mt-8">
              <Text weight="semibold" className="text-title text-brand-700">
                {t('fieldDetail.pastAdvice')}
              </Text>
              {recs.slice(0, 3).map((rec) => {
                const pick = rec.result.segment_a[0] ?? rec.result.segment_b[0] ?? null;
                const pickName = pick ? (i18n.language === 'hi' ? pick.crop_hi : pick.crop) : null;
                return (
                  <Pressable
                    key={rec.id}
                    accessibilityRole="button"
                    onPress={() =>
                      navigation.navigate('Recommendation', {
                        fieldId,
                        fieldName: title,
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
                          {pickName ? `${t('history.topPick')}: ${pickName}` : t('recommendation.title')}
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
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

