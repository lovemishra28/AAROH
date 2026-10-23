import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components';
import { colors } from '@/theme/tokens';

/**
 * The server (and `lib/phone.ts`) only normalises Indian mobile numbers today, so this
 * picker offers a single entry. It is still a real, tappable control — not a static label
 * — so it is ready to grow into a multi-country list the moment the backend accepts others.
 */
export function CountryCodeField() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="h-touch flex-row items-center rounded-field border border-line bg-surface px-3"
      >
        <Text weight="medium" className="text-body text-ink">
          🇮🇳 +91
        </Text>
        <View className="ml-1.5">
          <Ionicons name="chevron-down" size={16} color={colors.ink.faint} />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onPress={() => setOpen(false)}
        >
          <View className="rounded-t-3xl bg-surface p-5 pb-8">
            <Text weight="semibold" className="mb-3 text-body-lg text-ink">
              {t('auth.countryLabel')}
            </Text>
            <View className="flex-row items-center justify-between rounded-field bg-brand-50 px-4 py-3">
              <Text weight="medium" className="text-body text-brand-700">
                🇮🇳 {t('auth.countryIndiaOption')}
              </Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
