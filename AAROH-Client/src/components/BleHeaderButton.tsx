import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useBle } from '@/lib/ble/BleContext';
import { colors } from '@/theme/tokens';

import { ConnectStickModal } from './ConnectStickModal';

/**
 * The "Connect Stick" affordance in the header. It holds no BLE logic of its own — it reads
 * connection state from the context and opens the picker. All five states are legible at a
 * glance: green + dot when connected, amber while working, red on failure, grey otherwise.
 */
export function BleHeaderButton() {
  const [modalVisible, setModalVisible] = useState(false);
  const { state } = useBle();
  const { t } = useTranslation();

  const isConnected = state === 'Connected';
  const isBusy = state === 'Connecting' || state === 'Scanning';
  const isError = state === 'Error';

  const iconColor = isConnected
    ? colors.grow[600]
    : isBusy
      ? colors.invest[600]
      : isError
        ? colors.avoid[600]
        : colors.ink.muted;

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={isConnected ? t('ble.connectedTitle') : t('ble.connectTitle')}
        className="relative mr-2 p-2"
      >
        <Ionicons name={isConnected ? 'bluetooth' : 'bluetooth-outline'} size={24} color={iconColor} />
        {isConnected && (
          <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-grow-500" />
        )}
      </Pressable>

      <ConnectStickModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}
