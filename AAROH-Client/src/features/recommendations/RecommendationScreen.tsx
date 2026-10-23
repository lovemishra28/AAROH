import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { useRequestAdvice, useFieldRecommendations } from '@/api/recommendations';
import type { CropPlan, CropRank, RecommendationResult } from '@/api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoStrip,
  LoadingState,
  Screen,
  ScreenHeader,
  SpeakButton,
  Text,
} from '@/components';
import { rationaleKeys, parseWarning } from '@/lib/advice';
import { isNeedsSetupError } from '@/lib/errors';
import { formatInr, formatNumber, scoreBandForIndex } from '@/lib/format';
import { hectaresToAcres } from '@/lib/units';
import type { AppScreenProps } from '@/navigation/types';

/**
 * Recommendation screen (M6) — the payoff. With no `recommendationId` it POSTs for fresh
 * advice on mount; with one it renders a saved recommendation from the field's cache.
 *
 * The render is the frozen §6.4 shape: Segment A (grow now, green) and Segment B (worth it
 * with a stated fertiliser cost, amber). We never show the raw ML score — position within a
 * segment drives an ordinal band label instead. Fertiliser leads with 50 kg bags, then kg,
 * then a rupee total. Warnings are translated from their stable tokens, never raw English.
 */

type TFn = (key: string, params?: Record<string, unknown>) => string;

/** Segment A entry — grow now, green. Band label comes from rank position, never the score. */
function CropCard({ rank, index, lang, t }: { rank: CropRank; index: number; lang: string; t: TFn }) {
  const band = t(`advice.band.${scoreBandForIndex(index)}`);
  const name = lang === 'hi' ? rank.crop_hi : rank.crop;
  const keys = rationaleKeys(rank.rationale_code);
  return (
    <Card className="mt-3">
      <View className="flex-row items-center justify-between">
        <Text weight="semibold" className="flex-1 text-body-lg text-ink" numberOfLines={1}>
          {name}
        </Text>
        <View className="ml-2 rounded-pill bg-grow-50 px-2.5 py-1">
          <Text weight="medium" className="text-sm text-grow-700">
            {band}
          </Text>
        </View>
      </View>
      {keys.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {keys.map((k) => (
            <View key={k} className="rounded-field bg-grow-50 px-2.5 py-1">
              <Text className="text-sm text-grow-700">{t(k)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Segment B entry — worth it once the shown fertiliser is added (amber). */
function PlanCard({ plan, index, lang, t }: { plan: CropPlan; index: number; lang: string; t: TFn }) {
  const band = t(`advice.band.${scoreBandForIndex(index)}`);
  const name = lang === 'hi' ? plan.crop_hi : plan.crop;
  const keys = rationaleKeys(plan.rationale_code);
  const { products, nutrient_gap_kgha: gap, cost_inr } = plan.fertiliser;

  return (
    <Card className="mt-3">
      <View className="flex-row items-center justify-between">
        <Text weight="semibold" className="flex-1 text-body-lg text-ink" numberOfLines={1}>
          {name}
        </Text>
        <View className="ml-2 rounded-pill bg-invest-50 px-2.5 py-1">
          <Text weight="medium" className="text-sm text-invest-700">
            {band}
          </Text>
        </View>
      </View>

      {keys.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {keys.map((k) => (
            <View key={k} className="rounded-field bg-invest-50 px-2.5 py-1">
              <Text className="text-sm text-invest-700">{t(k)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-3 border-t border-line pt-3">
        {products.map((p) => (
          <View key={p.name} className="flex-row items-center justify-between py-1">
            <Text className="flex-1 text-body text-ink" numberOfLines={1}>
              {p.name}
            </Text>
            <Text weight="medium" className="ml-2 text-body text-ink">
              {t('recommendation.bags', { count: p.bags_50kg })}
            </Text>
          </View>
        ))}
        {products.map((p) => (
          <Text key={`${p.name}-kg`} className="text-sm text-ink-faint">
            {p.name}: {t('recommendation.orKg', { kg: formatNumber(p.kg, 0) })}
          </Text>
        ))}
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-body text-ink-muted">{t('recommendation.totalCost')}</Text>
        <Text weight="bold" className="text-title text-invest-700">
          {formatInr(cost_inr)}
        </Text>
      </View>

      <View className="mt-3 rounded-field bg-surface-sunken p-3">
        <Text className="text-sm text-ink-muted">{t('recommendation.nutrientGap')}</Text>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-body text-ink">
            {t('recommendation.gapN')} {formatNumber(gap.n_kgha, 0)}
          </Text>
          <Text className="text-body text-ink">
            {t('recommendation.gapP')} {formatNumber(gap.p2o5_kgha, 0)}
          </Text>
          <Text className="text-body text-ink">
            {t('recommendation.gapK')} {formatNumber(gap.k2o_kgha, 0)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Builds the short phrase the Listen button speaks aloud (in the active language). */
function buildSummary(result: RecommendationResult, lang: string, t: TFn): string {
  const aNames = result.segment_a.map((r) => (lang === 'hi' ? r.crop_hi : r.crop));
  const bNames = result.segment_b.map((p) => (lang === 'hi' ? p.crop_hi : p.crop));
  const parts: string[] = [];
  if (aNames.length) parts.push(`${t('recommendation.segmentATitle')}: ${aNames.join(', ')}`);
  if (bNames.length) parts.push(`${t('recommendation.segmentBTitle')}: ${bNames.join(', ')}`);
  return parts.join('. ');
}

function warningTone(parsed: ReturnType<typeof parseWarning>): 'invest' | 'info' {
  if ('key' in parsed && /acidic|alkaline|season/.test(parsed.key)) return 'invest';
  return 'info';
}

function RecommendationBody({ result, lang, t }: { result: RecommendationResult; lang: string; t: TFn }) {
  const area = `${formatNumber(hectaresToAcres(result.area_ha), 2)} ${t('fieldCreate.areaUnit')}`;
  const summary = useMemo(() => buildSummary(result, lang, t), [result, lang, t]);

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
      <Text className="text-body text-ink-muted">{t('recommendation.forArea', { area })}</Text>
      {summary ? <SpeakButton text={summary} className="mt-3" /> : null}

      {/* Segment A — grow now */}
      <Text weight="bold" className="mt-6 text-title text-grow-700">
        {t('recommendation.segmentATitle')}
      </Text>
      <Text className="mt-0.5 text-sm text-ink-muted">{t('recommendation.segmentASub')}</Text>
      {result.segment_a.length > 0 ? (
        result.segment_a.map((rank, i) => (
          <CropCard key={`${rank.crop}-${i}`} rank={rank} index={i} lang={lang} t={t} />
        ))
      ) : (
        <View className="mt-3">
          <InfoStrip tone="info" text={t('recommendation.noGrowNow')} />
        </View>
      )}

      {/* Segment B — worth it with inputs */}
      <Text weight="bold" className="mt-8 text-title text-invest-700">
        {t('recommendation.segmentBTitle')}
      </Text>
      <Text className="mt-0.5 text-sm text-ink-muted">{t('recommendation.segmentBSub')}</Text>
      {result.segment_b.length > 0 ? (
        result.segment_b.map((plan, i) => (
          <PlanCard key={`${plan.crop}-${i}`} plan={plan} index={i} lang={lang} t={t} />
        ))
      ) : (
        <View className="mt-3">
          <InfoStrip tone="info" text={t('recommendation.noInvest')} />
        </View>
      )}

      {/* Warnings — translated tokens, never raw English */}
      {result.warnings.length > 0 ? (
        <View className="mt-8">
          <Text weight="semibold" className="text-title text-brand-700">
            {t('recommendation.warningsTitle')}
          </Text>
          <View className="mt-2" style={{ gap: 8 }}>
            {result.warnings.map((w, i) => {
              const parsed = parseWarning(w);
              const text = 'key' in parsed ? t(parsed.key, parsed.params) : parsed.text;
              return <InfoStrip key={i} tone={warningTone(parsed)} text={text} />;
            })}
          </View>
        </View>
      ) : null}

      <Text className="mt-8 text-center text-sm text-ink-faint">
        {t('recommendation.generatedNote', { model: result.model_version, agronomy: result.agronomy_version })}
      </Text>
    </ScrollView>
  );
}

export function RecommendationScreen({ route, navigation }: AppScreenProps<'Recommendation'>) {
  const { t, i18n } = useTranslation();
  const { fieldId, fieldName, recommendationId } = route.params;
  const lang = i18n.language;

  const advice = useRequestAdvice(fieldId);
  const { data: recs, isLoading: recsLoading } = useFieldRecommendations(fieldId);
  const requested = useRef(false);

  // Fresh-advice mode fires the POST once on mount; saved mode reads from the list cache.
  useEffect(() => {
    if (!recommendationId && !requested.current) {
      requested.current = true;
      advice.mutate({});
    }
  }, [recommendationId, advice]);

  const retry = () => advice.mutate({});
  const goReading = () => navigation.replace('ManualReading', { fieldId, fieldName });

  let content: ReactNode;

  if (recommendationId) {
    const saved = recs?.find((r) => r.id === recommendationId);
    content =
      recsLoading && !saved ? (
        <LoadingState />
      ) : saved ? (
        <RecommendationBody result={saved.result} lang={lang} t={t} />
      ) : (
        <EmptyState icon="alert-circle-outline" title={t('errors.notFound')} />
      );
  } else if (advice.isSuccess) {
    content = <RecommendationBody result={advice.data.recommendation.result} lang={lang} t={t} />;
  } else if (advice.isError) {
    const err = advice.error;
    if (isNeedsSetupError(err)) {
      const isArea = err instanceof ApiError && err.code === 'AREA_REQUIRED';
      content = isArea ? (
        <EmptyState icon="resize-outline" title={t('recommendation.needAreaTitle')} message={t('recommendation.needAreaMessage')} />
      ) : (
        <EmptyState
          icon="create-outline"
          title={t('recommendation.needReadingTitle')}
          message={t('recommendation.needReadingMessage')}
          action={<Button label={t('recommendation.needReadingAction')} icon="create-outline" onPress={goReading} />}
        />
      );
    } else {
      content = <ErrorState error={err} onRetry={retry} />;
    }
  } else {
    content = <LoadingState label={t('recommendation.requesting')} />;
  }

  return (
    <Screen>
      <ScreenHeader title={t('recommendation.title')} subtitle={fieldName} onBack={() => navigation.goBack()} />
      {content}
    </Screen>
  );
}




