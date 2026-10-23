import { useEffect } from 'react';
import { Pressable, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useBle } from '@/lib/ble/BleContext';
import { colors } from '@/theme/tokens';

import { Text } from './Text';

/**
 * Banner shown when the sensing stick is connected and has stored readings to sync.
 *
 * Three states:
 *  • **idle with pending**: "Stick has X readings → Sync Now"
 *  • **syncing**: "Syncing readings from stick…" with a spinner
 *  • **done**: "✓ Readings synced" — auto-dismissed after a few seconds
 *
 * Renders nothing when: no stick is connected, or the stick has no stored readings,
 * or the sync has been dismissed.
 */
export function StickSyncBanner() {
  const { t } = useTranslation();
  const { state, syncState, dismissSync } = useBle();

  useEffect(() => {
    if (syncState === 'done') {
      const timer = setTimeout(() => dismissSync(), 5000);
      return () => clearTimeout(timer);
    }
  }, [syncState, dismissSync]);

  // Only show when connected and there's something relevant to display
  if (state !== 'Connected') return null;
  if (syncState === 'idle') return null;

  // Syncing in progress
  if (syncState === 'syncing') {
    return (
      <View className="flex-row items-center px-5 py-3" style={{ backgroundColor: colors.invest[50] }}>
        <ActivityIndicator size="small" color={colors.invest[600]} />
        <Text className="ml-2 flex-1 text-sm" style={{ color: colors.invest[700] }}>
          {t('stickSync.syncing')}
        </Text>
      </View>
    );
  }

  // Sync complete
  if (syncState === 'done') {
    return (
      <Pressable
        onPress={dismissSync}
        className="flex-row items-center px-5 py-3"
        style={{ backgroundColor: colors.grow[50] }}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.grow[600]} />
        <Text className="ml-2 flex-1 text-sm" weight="medium" style={{ color: colors.grow[700] }}>
          {t('stickSync.done')}
        </Text>
        <Ionicons name="close" size={16} color={colors.grow[600]} />
      </Pressable>
    );
  }

  return null;
}
