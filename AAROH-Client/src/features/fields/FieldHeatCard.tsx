import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFieldReadings } from '@/api/readings';
import type { Field, Reading } from '@/api/types';
import { Card, HeatMap, Text, Shimmer, type HeatPoint } from '@/components';
import { HEAT_METRICS, formatMetric, metricById, readingMetric, type MetricDef, type MetricId } from '@/lib/fields';
import { formatClock, formatDateTime } from '@/lib/format';
import { pointFromGeoJson, ringFromGeoJson, type LatLng } from '@/lib/geo';
import { hectaresToAcres, roundTo } from '@/lib/units';
import { colors } from '@/theme/tokens';

/**
 * The fertility map for one field (Workstream 3).
 *
 * This is the surface that makes automatic segregation worth having. A field average
 * tells the farmer what to buy; this tells them *where to put it* — that the north end
 * of the plot is short of nitrogen while the south is fine, which is invisible in a
 * single number and is the entire reason for walking the field instead of taking one
 * sample at the gate.
 *
 * Everything drawn here comes from stored readings, so the map and the averages above it
 * can never disagree: same query, same units, same field.
 */

type FieldHeatCardProps = {
  field: Field;
  className?: string;
  isTransitioning?: boolean;
};

/** Readings that have both a position and a value for this metric. */
function heatPoints(readings: readonly Reading[], metric: MetricDef): HeatPoint[] {
  const points: HeatPoint[] = [];
  for (const reading of readings) {
    const at = pointFromGeoJson(reading.location);
    if (!at) continue;
    const value = readingMetric(reading, metric);
    if (value === null) continue;
    points.push({
      id: reading.id,
      lat: at.lat,
      lng: at.lng,
      value,
      caption: `${formatMetric(value, metric)}${metric.unit ? ` ${metric.unit}` : ''} · ${reading.taken_at ? formatClock(reading.taken_at) : formatDateTime(reading.created_at)
        }`,
    });
  }
  return points;
}

function MetricChip({
  metric,
  selected,
  enabled,
  onPress,
}: {
  metric: MetricDef;
  selected: boolean;
  enabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !enabled }}
      accessibilityLabel={t(metric.labelKey)}
      disabled={!enabled}
      onPress={onPress}
      className={`mr-2 rounded-pill px-3 py-1.5 ${selected ? 'bg-brand-700' : enabled ? 'bg-surface-sunken' : 'bg-surface-sunken opacity-40'
        }`}
    >
      <Text
        weight={selected ? 'semibold' : 'regular'}
        className={`text-sm ${selected ? 'text-white' : 'text-ink-muted'}`}
      >
        {metric.short}
      </Text>
    </Pressable>
  );
}

export function FieldHeatCard({ field, className, isTransitioning }: FieldHeatCardProps) {
  const { t } = useTranslation();
  const { data: readings, isFetching } = useFieldReadings(field.id);
  const [metricId, setMetricId] = useState<MetricId>('n');

  const metric = metricById(metricId);
  const rows = readings ?? [];

  const points = useMemo(() => heatPoints(rows, metric), [rows, metric]);

  // A chip is offered only when the stick actually reported that value somewhere with a
  // position — an enabled chip that draws an empty map is a dead end.
  const available = useMemo(() => {
    const ids = new Set<MetricId>();
    for (const m of HEAT_METRICS) {
      if (rows.some((r) => pointFromGeoJson(r.location) !== null && readingMetric(r, m) !== null)) {
        ids.add(m.id);
      }
    }
    return ids;
  }, [rows]);

  const boundary = useMemo<LatLng[]>(() => ringFromGeoJson(field.boundary), [field.boundary]);
  const located = useMemo(() => rows.filter((r) => pointFromGeoJson(r.location) !== null), [rows]);

  const emptyLabel =
    rows.length === 0
      ? t('heat.emptyNoReadings')
      : located.length === 0
        ? t('heat.emptyNoGps')
        : t('heat.emptyMetric', { metric: t(metric.labelKey) });

  return (
    <Card className={className}>
      <Text weight="semibold" className="text-body text-ink">
        {t('heat.title')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerStyle={{ paddingRight: 8 }}
      >
        {HEAT_METRICS.map((m) => (
          <MetricChip
            key={m.id}
            metric={m}
            selected={m.id === metricId}
            enabled={available.has(m.id) || m.id === metricId}
            onPress={() => setMetricId(m.id)}
          />
        ))}
      </ScrollView>

      <View className="mt-3 relative rounded-xl overflow-hidden" style={{ height: 280, backgroundColor: colors.surface.sunken }}>
        <HeatMap
          height={280}
          points={points}
          boundary={boundary.length >= 3 ? boundary : undefined}
          format={(v) => `${formatMetric(v, metric)}${metric.unit ? ` ${metric.unit}` : ''}`}
          emptyLabel={emptyLabel}
        />
        {field.area_ha ? (
          <View pointerEvents="none" className="absolute inset-0 justify-center items-center">
            <Text weight="bold" className="text-4xl text-white opacity-70">
              {roundTo(hectaresToAcres(field.area_ha), 1)} acres
            </Text>
          </View>
        ) : null}
        {(isTransitioning || isFetching) ? (
          <View style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
            <Shimmer width={600} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
