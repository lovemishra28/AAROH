import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { updateMe } from '@/api/auth';
import { Button, Input, Screen, Text } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/tokens';
/**
 * Shown by RootNavigator when an authenticated farmer has no name yet — the one-time name
 * capture that every new user (phone, email, or Google) passes through before the app
 * opens. It deliberately takes no navigation props: once updateMe sets the name and
 * setFarmer updates the store, RootNavigator's gate re-evaluates and mounts the app. That
 * store-driven swap is exactly why this replaced the old push-from-OtpScreen approach,
 * which fired against an already-unmounting AuthNavigator and never landed.
 */
export function ProfileCompleteScreen() {
  const { t } = useTranslation();
  const setFarmer = useAuthStore((s) => s.setFarmer);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (trimmedName: string) => updateMe({ name: trimmedName }),
    onSuccess: (result) => {
      // setFarmer updates the store; RootNavigator then sees a farmer with a name and
      // swaps this screen out for the app. No imperative navigation required.
      setFarmer(result.farmer);
    },
  });

  const onSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('profileComplete.errNameRequired'));
      return;
    }
    setNameError(null);
    mutation.mutate(trimmed);
  };

  return (
    <Screen className="bg-surface">
      <KeyboardAwareScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 60 }}
        enableOnAndroid={true}
        extraScrollHeight={20}
      >
        {/* Profile icon */}
        <View className="mb-8 items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="person" size={48} color={colors.brand[600]} />
          </View>
        </View>

        {/* Title */}
        <Text weight="bold" className="text-center text-2xl text-ink">
          {t('profileComplete.title')}
        </Text>
        <Text className="mt-2 text-center text-body text-ink-muted">
          {t('profileComplete.subtitle')}
        </Text>

        {/* Name input */}
        <View className="mt-10">
          <Input
            label={t('profileComplete.nameLabel')}
            icon="person-outline"
            placeholder={t('profileComplete.namePlaceholder')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError(null);
            }}
            error={nameError}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
        </View>

        <View className="mt-8">
          <Button
            label={t('profileComplete.submit')}
            loading={mutation.isPending}
            onPress={onSubmit}
          />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
