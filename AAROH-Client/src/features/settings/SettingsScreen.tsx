import { Alert, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';

import { Button, Card, LanguageChip, Screen, SectionTitle, Text } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/tokens';

/**
 * Settings tab (M4) — account facts, the language toggle promoted to a full row, a small
 * about block, and sign-out (with a confirm so a mis-tap doesn't drop the session).
 */
function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center py-2.5">
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-pill bg-brand-50">
        <Ionicons name={icon} size={18} color={colors.brand[600]} />
      </View>
      <Text className="flex-1 text-body text-ink-muted">{label}</Text>
      <Text weight="medium" className="text-body text-ink" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const farmer = useAuthStore((s) => s.farmer);
  const signOut = useAuthStore((s) => s.signOut);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const confirmSignOut = () => {
    Alert.alert(t('settings.signOut'), t('settings.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <View className="px-5 pt-3">
        <SectionTitle>{t('settings.title')}</SectionTitle>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
        <View className="mb-8 items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="person" size={48} color={colors.brand[600]} />
          </View>
          <Text weight="semibold" className="mt-3 text-xl text-ink">
            {farmer?.name || 'Farmer'}
          </Text>
        </View>

        <Text weight="medium" className="mb-2 text-sm text-ink-muted">
          {t('settings.account')}
        </Text>
        <Card>
          {farmer?.name ? (
            <Row icon="person-outline" label={t('auth.nameLabel')} value={farmer.name} />
          ) : null}
          {/* Which identifiers exist depends on how the farmer signed up: phone+OTP,
              email, or Google. Rows are conditional rather than showing a dash for a
              door this account never used. */}
          {farmer?.phone ? (
            <Row icon="call-outline" label={t('settings.phone')} value={farmer.phone} />
          ) : null}
          {farmer?.email ? (
            <Row
              icon="mail-outline"
              label={t('settings.email')}
              value={
                farmer.email_verified
                  ? farmer.email
                  : `${farmer.email} · ${t('settings.emailUnverified')}`
              }
            />
          ) : null}
          {!farmer?.phone && !farmer?.email ? (
            <Row icon="call-outline" label={t('settings.phone')} value="—" />
          ) : null}
          <Row icon="person-outline" label={t('settings.role')} value={farmer?.role ?? 'farmer'} />
          <Row icon="location-outline" label={t('settings.region')} value={farmer?.region_code ?? '—'} />
        </Card>

        <Text weight="medium" className="mb-2 mt-6 text-sm text-ink-muted">
          {t('settings.preferences')}
        </Text>
        <Card className="flex-row items-center">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-pill bg-brand-50">
            <Ionicons name="language-outline" size={18} color={colors.brand[600]} />
          </View>
          <Text className="flex-1 text-body text-ink">{t('settings.language')}</Text>
          <LanguageChip />
        </Card>

        <Button
          label={t('settings.signOut')}
          variant="secondary"
          icon="log-out-outline"
          className="mt-8"
          onPress={confirmSignOut}
        />

        <Text className="mt-8 text-center text-xs text-ink-muted">
          {t('settings.appVersion')} {version}
        </Text>
      </ScrollView>
    </Screen>
  );
}
