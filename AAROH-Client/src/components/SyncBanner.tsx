import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/tokens';
import { useConnectivityStore } from '@/store/connectivityStore';
import { useOutboxStore } from '@/store/outboxStore';

import { Text } from './Text';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Slim status bar for the offline/sync story (M8). It stays out of the way when everything
 * is synced and online (renders nothing), and otherwise carries exactly one calm line:
 * "offline — showing saved data", "N changes waiting to sync", or "syncing…". This is the
 * nuance the guide asks for — offline is never dressed up as an error.
 */
export function SyncBanner() {
  const { t } = useTranslation();
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const pending = useOutboxStore((s) => s.items.length);
  const draining = useOutboxStore((s) => s.draining);

  if (isOnline && pending === 0) return null;

  let bg: string = colors.info[50];
  let fg: string = colors.info[600];
  let icon: IoniconName = 'cloud-offline-outline';
  let text = t('sync.offline');

  if (!isOnline) {
    text = pending > 0 ? t('sync.pending', { count: pending }) : t('sync.offline');
  } else if (draining) {
    bg = colors.invest[50];
    fg = colors.invest[600];
    icon = 'sync-outline';
    text = t('sync.syncing');
  } else {
    bg = colors.invest[50];
    fg = colors.invest[600];
    icon = 'cloud-upload-outline';
    text = t('sync.pending', { count: pending });
  }

  return (
    <View className="flex-row items-center px-5 py-2" style={{ backgroundColor: bg }}>
      <View className="mr-2">
        <Ionicons name={icon} size={16} color={fg} />
      </View>
      <Text className="flex-1 text-sm" style={{ color: fg }}>
        {text}
      </Text>
    </View>
  );
}
