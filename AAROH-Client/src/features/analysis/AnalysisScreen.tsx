import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { useFields } from '@/api/fields';
import type { Field } from '@/api/types';
import { Button, Card, ErrorState, LoadingState, Screen, SectionTitle, SyncBanner, Text } from '@/components';
import { areaLabel, fieldLabel, fieldLabels } from '@/lib/fields';
import { colors } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

import { ScansSection } from './ScansSection';

/**
 * Analysis tab — what the stick measured, and the fields those measurements belong to.
 *
 * It replaces the old Fields tab and keeps that list unchanged; the Scans section above it
 * is new. The order is deliberate: a reading arrives from the stick first, and deciding
 * which field it belongs to is the next question, so the raw scans sit above the fields
 * they will eventually be attached to.
 *
 * Both sections live in one ScrollView, which is why the fields list no longer takes over
 * the whole screen on loading/empty/error — those states are now section-sized. Getting
 * advice is still a field action, reached by opening a field.
 */
type Nav = NativeStackNavigationProp<AppStackParamList>;

function FieldRow({
  field,
  label,
  onPress,
}: {
  field: Field;
  label: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const count = field.aggregate?.reading_count ?? 0;
  const auto = field.source === 'auto';
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card className="mt-3 flex-row items-center">
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-pill bg-brand-50">
          <Ionicons name={auto ? 'locate' : 'leaf-outline'} size={20} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <Text weight="semibold" className="text-body-lg text-ink" numberOfLines={1}>
            {label}
          </Text>
          <Text className="mt-0.5 text-sm text-ink-muted">
            {count > 0 ? t('fields.readings', { count }) : t('fields.noReadings')} ·{' '}
            {areaLabel(field, t)}
          </Text>
          {auto ? (
            <Text className="mt-0.5 text-xs text-ink-faint">{t('fields.autoDetected')}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.ink.faint} />
      </Card>
    </Pressable>
  );
}

/** The former Fields tab — now the second section of Analysis, with detected fields named. */
function FieldsSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { data: fields, isLoading, isError, error, refetch } = useFields();

  const labels = useMemo(() => fieldLabels(fields ?? [], t), [fields, t]);

  const addField = () => navigation.navigate('FieldCreate');
  const openField = (field: Field) =>
    navigation.navigate('FieldDetail', {
      fieldId: field.id,
      fieldName: fieldLabel(field, t, labels),
    });

  return (
    <View>
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !fields || fields.length === 0 ? (
        <Card className="mt-3 items-center py-6">
          <Ionicons name="leaf-outline" size={26} color={colors.ink.faint} />
          <Text weight="semibold" className="mt-2 text-body text-ink">
            {t('fields.emptyTitle')}
          </Text>
          <Text className="mt-1 px-4 text-center text-sm text-ink-muted">
            {t('fields.emptyMessage')}
          </Text>
          <Button label={t('fields.addField')} icon="add" className="mt-4" onPress={addField} />
        </Card>
      ) : (
        <>
          {fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              label={fieldLabel(field, t, labels)}
              onPress={() => openField(field)}
            />
          ))}
          <Button
            label={t('fields.addField')}
            icon="add"
            variant="secondary"
            className="mt-5"
            onPress={addField}
          />
        </>
      )}
    </View>
  );
}

export function AnalysisScreen() {
  const { t } = useTranslation();

  return (
    <Screen edges={['top']}>
      <SyncBanner />
      <View className="px-5 pt-3">
        <SectionTitle>{t('analysis.title')}</SectionTitle>
        <Text className="mt-1 text-body text-ink-muted">{t('analysis.subtitle')}</Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 32 }}
      >
        <FieldsSection />
        <View className="mt-7">
          <ScansSection />
        </View>
      </ScrollView>
    </Screen>
  );
}
