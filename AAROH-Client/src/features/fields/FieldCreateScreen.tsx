import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCreateField } from '@/api/fields';
import { NetworkError } from '@/api/client';
import { Button, Input, Screen, ScreenHeader, Text } from '@/components';
import { acresToHectares, roundTo } from '@/lib/units';
import { formatNumber } from '@/lib/format';
import type { AppScreenProps } from '@/navigation/types';

/**
 * Add-a-field form (M4). The farmer thinks in acres; the server wants hectares, so we show
 * the converted hectares live beneath the area field and send `area_ha`. Area is effectively
 * required — the recommendation refuses without it — so we validate it here rather than let
 * the money screen dead-end later.
 */
export function FieldCreateScreen({ navigation }: AppScreenProps<'FieldCreate'>) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [acres, setAcres] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateField();

  const acresNum = Number(acres);
  const areaHelper = useMemo(() => {
    if (!acres.trim() || !Number.isFinite(acresNum) || acresNum <= 0) {
      return t('fieldCreate.areaHelperEmpty');
    }
    return t('fieldCreate.areaHelper', { ha: formatNumber(acresToHectares(acresNum), 2) });
  }, [acres, acresNum, t]);

  const onSubmit = () => {
    setNameError(null);
    setAreaError(null);
    setFormError(null);

    let ok = true;
    if (!name.trim()) {
      setNameError(t('fieldCreate.errNameRequired'));
      ok = false;
    }
    if (!acres.trim()) {
      setAreaError(t('fieldCreate.errAreaRequired'));
      ok = false;
    } else if (!Number.isFinite(acresNum) || acresNum <= 0) {
      setAreaError(t('fieldCreate.errAreaPositive'));
      ok = false;
    }
    if (!ok) return;

    create.mutate(
      { name: name.trim(), area_ha: roundTo(acresToHectares(acresNum), 4) },
      {
        onSuccess: (result) => {
          navigation.replace('FieldDetail', {
            fieldId: result.field.id,
            fieldName: result.field.name ?? undefined,
          });
        },
        onError: (err) => {
          setFormError(err instanceof NetworkError ? t('errors.network') : t('errors.generic'));
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('fieldCreate.title')} onBack={() => navigation.goBack()} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20 }}
      >
        <Input
          label={t('fieldCreate.nameLabel')}
          icon="map-outline"
          placeholder={t('fieldCreate.namePlaceholder')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError) setNameError(null);
          }}
          error={nameError}
          returnKeyType="next"
        />

        <View className="mt-5">
          <Input
            label={t('fieldCreate.areaLabel')}
            icon="resize-outline"
            keyboardType="decimal-pad"
            placeholder={t('fieldCreate.areaPlaceholder')}
            value={acres}
            onChangeText={(v) => {
              setAcres(v);
              if (areaError) setAreaError(null);
            }}
            error={areaError}
            trailing={<Text className="text-body text-ink-muted">{t('fieldCreate.areaUnit')}</Text>}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
          <Text className="mt-1.5 text-sm text-ink-faint">{areaHelper}</Text>
        </View>

        {formError ? <Text className="mt-4 text-body text-avoid-600">{formError}</Text> : null}

        <Button
          label={t('fieldCreate.submit')}
          icon="checkmark"
          className="mt-8"
          loading={create.isPending}
          onPress={onSubmit}
        />
      </ScrollView>
    </Screen>
  );
}
