import { useMemo, useState, useEffect } from 'react';
import { Pressable, ScrollView, View, Platform, UIManager, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Animated, { LinearTransition, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useFields } from '@/api/fields';
import type { Field } from '@/api/types';
import {
  BleHeaderButton,
  BrandHeader,
  Button,
  Card,
  ConnectStickModal,
  LanguageChip,
  MetricTile,
  Screen,
  SectionTitle,
  StepRow,
  StickSyncBanner,
  SyncBanner,
  Text,
} from '@/components';
import { FieldHeatCard } from '@/features/fields/FieldHeatCard';
import { FieldSwitcher } from '@/features/fields/FieldSwitcher';
import { SyncScansCard } from '@/features/sync/SyncScansCard';
import {
  HEAT_METRICS,
  aggregateMetric,
  fieldLabel,
  fieldLabels,
  formatMetric,
  sortFieldsNewestFirst,
  type MetricDef,
} from '@/lib/fields';
import { colors } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Home dashboard — rebuilt for automatic field segregation (Workstream 3).
 *
 * The old dashboard led with "Add field", because a field was something the farmer had to
 * declare before any data could hang off it. That is no longer true: the stick records
 * where it was, the server clusters those positions, and fields, boundaries and averages
 * appear as a *result* of syncing. So the screen is now ordered the way the work actually
 * happens — sync first, then the field the farmer just walked, its averages, and the map
 * of how fertility varies inside it — and manual creation is demoted to a quiet link for
 * the farmer who has no stick yet.
 *
 * Everything below the switcher is scoped to one selected field, so switching plots is a
 * single tap that moves the averages, the map and the advice button together.
 */
type Nav = NativeStackNavigationProp<AppStackParamList>;

function PulseView({ isTransitioning, children, className }: { isTransitioning: boolean, children: React.ReactNode, className?: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isTransitioning) {
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
  }, [isTransitioning, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: isTransitioning ? 0.7 : 1,
  }));

  return (
    <Animated.View style={animatedStyle} className={className}>
      {isTransitioning ? (
        <View className="flex-1 justify-center items-center" />
      ) : (
        children
      )}
    </Animated.View>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { data: fields } = useFields();

  const [connectVisible, setConnectVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridLayoutIndex, setGridLayoutIndex] = useState(() => Math.floor(Math.random() * 4));

  const handleSelectField = (id: string | null) => {
    setIsTransitioning(true);
    setSelectedId(id);
    // Let the JS thread render the pill switch first, then unblock the heavy map rendering
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => setIsTransitioning(false), 50);
    });
  };

  useEffect(() => {
    setGridLayoutIndex(Math.floor(Math.random() * 4));
  }, [selectedId]);

  const layouts = useMemo(() => [
    [{ w: '65%', h: 100 }, { w: '31%', h: 100 }, { w: '31%', h: 70 }, { w: '65%', h: 70 }],
    [{ w: '31%', h: 100 }, { w: '65%', h: 100 }, { w: '65%', h: 70 }, { w: '31%', h: 70 }],
    [{ w: '65%', h: 70 }, { w: '31%', h: 70 }, { w: '31%', h: 100 }, { w: '65%', h: 100 }],
    [{ w: '31%', h: 70 }, { w: '65%', h: 70 }, { w: '65%', h: 100 }, { w: '31%', h: 100 }],
  ], []);
  const gridLayout = layouts[gridLayoutIndex];

  const ordered = useMemo(() => sortFieldsNewestFirst(fields ?? []), [fields]);
  const labels = useMemo(() => fieldLabels(fields ?? [], t), [fields, t]);

  /**
   * Selection is *derived*, never synchronised with an effect. An id that has gone away
   * (deleted field, different account, first load) falls through to the newest field, so a
   * sync that invents two fields can never leave the dashboard pointing at nothing — and
   * an explicit choice still survives the list changing underneath it.
   */
  const selected = useMemo<Field | null>(
    () => ordered.find((f) => f.id === selectedId) ?? ordered[0] ?? null,
    [ordered, selectedId],
  );

  /** The metric means that exist. Absent ones are dropped rather than shown as dashes. */
  const means = useMemo<{ metric: MetricDef; value: number }[]>(() => {
    const aggregate = selected?.aggregate;
    const rows: { metric: MetricDef; value: number }[] = [];
    for (const metric of HEAT_METRICS) {
      const value = aggregateMetric(aggregate, metric);
      if (value !== null) rows.push({ metric, value });
    }
    return rows;
  }, [selected]);

  const readingCount = selected?.aggregate?.reading_count ?? 0;

  const openField = (fieldId: string) => {
    const field = (fields ?? []).find((f) => f.id === fieldId);
    navigation.navigate('FieldDetail', {
      fieldId,
      // Pass the label the dashboard used, so the pushed screen's title agrees with the
      // pill that was tapped — an auto field has no name of its own to fall back on.
      fieldName: field ? fieldLabel(field, t, labels) : undefined,
    });
  };

  const getAdvice = () => {
    if (!selected) return;
    navigation.navigate('Recommendation', {
      fieldId: selected.id,
      fieldName: fieldLabel(selected, t, labels),
    });
  };

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <BrandHeader />
        <View className="flex-row items-center">
          <LanguageChip />
        </View>
      </View>
      <SyncBanner />
      <StickSyncBanner />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingTop: 8 }}
      >
        {/* The primary action. Always mounted, so the sync report it produces stays on
            screen after the pending count drops to zero. */}
        <SyncScansCard
          className="mt-6"
          onConnect={() => setConnectVisible(true)}
          onOpenField={openField}
        />

        {selected ? (
          <>
            <Card className="mt-6 mb-2">
              <FieldSwitcher
                fields={ordered}
                allFields={fields ?? ordered}
                selectedId={selected.id}
                onSelect={handleSelectField}
              />
            </Card>
            {means.length > 0 ? (
              <>
                <View className="mt-3">
                  <View className="flex-row justify-between mb-4" style={{ gap: 8 }}>
                    {means.slice(0, 3).map(({ metric, value }) => (
                      <PulseView
                        key={metric.id}
                        isTransitioning={isTransitioning}
                        className="flex-1 rounded-full border border-ink bg-surface py-3 px-2 items-center justify-center"
                      >
                        <View className="mb-0.5 flex-row items-baseline justify-center flex-wrap">
                          <Text weight="bold" className="text-3xl text-ink" adjustsFontSizeToFit numberOfLines={1}>
                            {formatMetric(value, metric)}
                          </Text>
                          {metric.unit ? (
                            <Text className="ml-1 text-[10px] text-ink-muted">
                              {metric.unit}
                            </Text>
                          ) : null}
                        </View>
                        <Text className="text-xs text-ink-muted text-center" numberOfLines={1}>
                          {t(metric.labelKey)}
                        </Text>
                      </PulseView>
                    ))}
                  </View>
                  <Animated.View layout={LinearTransition} className="flex-row flex-wrap justify-between">
                    {means.slice(3).map(({ metric, value }, index) => {
                      const layout = gridLayout[index % 4];
                      return (
                        <Animated.View key={metric.id} layout={LinearTransition} style={{ width: layout.w, minWidth: 115, height: layout.h, marginBottom: 12 }}>
                          <MetricTile
                            label={t(metric.labelKey)}
                            value={formatMetric(value, metric)}
                            unit={metric.unit}
                            icon={metric.icon}
                            className="flex-1"
                            compact={layout.h <= 70}
                            isLoading={isTransitioning}
                          />
                        </Animated.View>
                      );
                    })}
                  </Animated.View>
                </View>
              </>
            ) : (
              <Card className="mt-2">
                <Text weight="semibold" className="text-body text-ink">
                  {t('home.noReadingsTitle')}
                </Text>
                <Text className="mt-1 text-sm text-ink-muted">{t('home.noReadingsMessage')}</Text>
              </Card>
            )}

            <FieldHeatCard field={selected} isTransitioning={isTransitioning} className="mt-2 mb-4" />
          </>
        ) : (
          <Card className="mt-8">
            <Text weight="semibold" className="text-body-lg text-ink">
              {t('home.emptyTitle')}
            </Text>
            <Text className="mt-1 text-body text-ink-muted">{t('home.emptyMessage')}</Text>
          </Card>
        )}

        {/* Manual creation still exists — a farmer without a stick, or with a lab report,
            needs it — but it is no longer the thing the dashboard asks for first. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('FieldCreate')}
          className="mt-5 flex-row items-center justify-center py-2"
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.brand[600]} />
          <Text weight="medium" className="ml-1.5 text-sm text-brand-600">
            {t('home.addFieldManual')}
          </Text>
        </Pressable>

      </ScrollView>

      <ConnectStickModal visible={connectVisible} onClose={() => setConnectVisible(false)} />
    </Screen>
  );
}
