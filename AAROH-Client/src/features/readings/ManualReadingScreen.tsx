import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSubmitReading } from '@/api/readings';
import type { ReadingInput } from '@/api/types';
import { Button, InfoStrip, Input, Screen, ScreenHeader, Text } from '@/components';
import { SOIL_FIELDS, isEcInRange, type SoilFieldId } from '@/lib/soil';
import { dsmToMicroSiemens } from '@/lib/units';
import { newIdempotencyKey } from '@/lib/id';
import type { AppScreenProps } from '@/navigation/types';

/**
 * Manual soil-reading form (M5). Six required values plus optional soil temperature, typed
 * by hand. Entered units are the farmer-facing ones (EC in dS/m); we convert EC to µS/cm and
 * mark NPK uncalibrated before POSTing. A "fill sample values" shortcut speeds demoing.
 *
 * Offline (M8): useSubmitReading queues the write and updates the field caches optimistically.
 * When that happens we return to the field (the reading already shows) rather than pushing to
 * advice, which needs the server — online, we go straight to the payoff.
 */
type Values = Record<SoilFieldId, string>;

const EMPTY: Values = { n: '', p: '', k: '', ph: '', ec: '', moisture: '', soilTemp: '' };

export function ManualReadingScreen({ route, navigation }: AppScreenProps<'ManualReading'>) {
  const { t } = useTranslation();
  const { fieldId, fieldName } = route.params;
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<SoilFieldId, string>>>({});
  const submit = useSubmitReading(fieldId);

  const setField = (id: SoilFieldId, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const fillSample = () => {
    const next: Values = { ...EMPTY };
    for (const f of SOIL_FIELDS) next[f.id] = String(f.sample);
    setValues(next);
    setErrors({});
  };

  // Soft warning: an EC that parses but sits outside the model's plausible dS/m window.
  const ecWarn = useMemo(() => {
    const raw = values.ec.trim();
    if (!raw) return false;
    const n = Number(raw);
    return Number.isFinite(n) && !isEcInRange(n);
  }, [values.ec]);

  function validate(): ReadingInput | null {
    const nextErrors: Partial<Record<SoilFieldId, string>> = {};
    const payload: ReadingInput = {
      field_id: fieldId,
      source: 'manual',
      npk_is_calibrated: false,
      taken_at: new Date().toISOString(),
      idempotency_key: newIdempotencyKey(),
    };

    for (const f of SOIL_FIELDS) {
      const raw = values[f.id].trim();
      if (!raw) {
        if (f.required) nextErrors[f.id] = t('reading.errRequired');
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        nextErrors[f.id] = t('reading.errRange', { min: f.min, max: f.max });
        continue;
      }
      const value = f.col === 'ec_uscm' ? dsmToMicroSiemens(n) : n;
      (payload as Record<string, unknown>)[f.col] = value;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? payload : null;
  }

  const onSubmit = () => {
    const payload = validate();
    if (!payload) return;

    submit.mutate(payload, {
      onSuccess: ({ queued }) => {
        if (queued) {
          Alert.alert(t('common.appName'), t('reading.savedOffline'), [
            { text: t('common.ok'), onPress: () => navigation.goBack() },
          ]);
        } else {
          navigation.replace('Recommendation', { fieldId, fieldName });
        }
      },
      onError: () => {
        Alert.alert(t('common.appName'), t('errors.generic'));
      },
    });
  };

  return (
    <Screen>
      <ScreenHeader title={t('reading.title')} subtitle={fieldName} onBack={() => navigation.goBack()} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingTop: 8 }}
      >
        <Text className="text-body text-ink-muted">{t('reading.requiredNote')}</Text>

        <Button
          label={t('reading.prefill')}
          icon="sparkles-outline"
          variant="secondary"
          className="mt-4"
          onPress={fillSample}
        />

        <View className="mt-2">
          {SOIL_FIELDS.map((f) => (
            <View key={f.id} className="mt-4">
              <Input
                label={`${t(f.labelKey)}${f.required ? '' : ` (${t('common.optional')})`}`}
                icon={f.icon}
                keyboardType="decimal-pad"
                placeholder={String(f.sample)}
                value={values[f.id]}
                onChangeText={(v) => setField(f.id, v)}
                error={errors[f.id]}
                trailing={f.unit ? <Text className="text-body text-ink-muted">{f.unit}</Text> : undefined}
              />
              <Text className="mt-1 text-sm text-ink-faint">{t(f.hintKey)}</Text>
              {f.id === 'ec' && ecWarn ? (
                <View className="mt-2">
                  <InfoStrip tone="invest" text={t('reading.ecWarn')} />
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <Button
          label={t('reading.submit')}
          icon="checkmark"
          className="mt-8"
          loading={submit.isPending}
          onPress={onSubmit}
        />
      </ScrollView>
    </Screen>
  );
}

