import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useBle } from '@/lib/ble/BleContext';
import { IS_DEV } from '@/lib/env';
import type { BleFailure, DiscoveredDevice } from '@/lib/ble/types';
import { colors } from '@/theme/tokens';

import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Failures the farmer can fix in the phone's own settings screen. */
const SETTINGS_FIXABLE = new Set(['permission_denied', 'location_services_off', 'bluetooth_off']);

/**
 * Four buckets, not a number: −60 dBm is "next to you", −90 is "barely there". Showing
 * dBm would mean nothing to a farmer, but the bars answer the one question that matters —
 * which of these entries is the stick in my hand.
 */
function signalBars(rssi: number | null): number {
  if (rssi === null) return 0;
  if (rssi >= -60) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

function SignalMeter({ rssi }: { rssi: number | null }) {
  const bars = signalBars(rssi);
  const heights = [6, 10, 14];
  return (
    <View className="flex-row items-end" style={{ gap: 2 }}>
      {heights.map((h, i) => (
        <View
          key={h}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            backgroundColor: i < bars ? colors.brand[600] : colors.line.default,
          }}
        />
      ))}
    </View>
  );
}

export function ConnectStickModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const {
    state,
    devices,
    connectedDeviceId,
    failure,
    isScanning,
    connect,
    startScan,
    stopScan,
    disconnect,
  } = useBle();

  /** The row that shows a spinner, so only the tapped device looks busy. */
  const [connectingId, setConnectingId] = useState<string | null>(null);
  // Auto-scan exactly once per open. Without the ref, the state change the scan itself
  // causes re-runs the effect and restarts the scan — straight into Android's
  // 5-scans-per-30-seconds limit, after which discovery goes silent with no error.
  const hasAutoScanned = useRef(false);

  useEffect(() => {
    if (!visible) {
      hasAutoScanned.current = false;
      stopScan();
    }
  }, [visible, stopScan]);

  useEffect(() => {
    if (visible && !hasAutoScanned.current && state !== 'Connected') {
      hasAutoScanned.current = true;
      startScan();
    }
  }, [visible, state, startScan]);

  const handleDevicePress = useCallback(
    async (deviceId: string) => {
      setConnectingId(deviceId);
      try {
        await connect(deviceId);
      } finally {
        setConnectingId(null);
      }
    },
    [connect],
  );

  const isConnected = state === 'Connected';
  const connectedDevice = devices.find((d) => d.id === connectedDeviceId) ?? null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-ink/40">
        <View className="rounded-t-3xl bg-surface p-6 pb-10" style={{ maxHeight: '85%' }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text weight="bold" className="text-title text-ink">
              {isConnected ? t('ble.connectedTitle') : t('ble.connectTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="p-2"
            >
              <Ionicons name="close" size={24} color={colors.ink.muted} />
            </Pressable>
          </View>

          {failure && !isConnected && <FailureNotice failure={failure} />}

          {isConnected ? (
            <View className="items-center py-6">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-pill bg-grow-50">
                <Ionicons name="bluetooth" size={32} color={colors.grow[600]} />
              </View>
              <Text weight="medium" className="text-body text-ink">
                {connectedDevice?.name ?? t('ble.likelyStick')}
              </Text>
              <Text className="mt-1 text-sm text-ink-muted">{t('ble.ready')}</Text>
              <View className="mt-8 w-full">
                <Button
                  label={t('ble.disconnect')}
                  variant="secondary"
                  onPress={() => void disconnect()}
                />
              </View>
            </View>
          ) : (
            <DevicePicker
              devices={devices}
              isScanning={isScanning}
              hasFailure={failure !== null}
              connectingId={connectingId}
              onPressDevice={(id) => void handleDevicePress(id)}
              onRescan={() => startScan()}
              onStop={stopScan}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Renders the failure by *code*, not by matching words in a message. The previous version
 * did `error.message.includes('Location (GPS)')`, which quietly stops working the moment a
 * library message is reworded — and could never work in Hindi.
 */
function FailureNotice({ failure }: { failure: BleFailure }) {
  const { t } = useTranslation();
  return (
    <View className="mb-4 rounded-xl border border-avoid-100 bg-avoid-50 p-4">
      <View className="mb-2 flex-row items-center" style={{ gap: 8 }}>
        <Ionicons name="warning-outline" size={18} color={colors.avoid[700]} />
        <Text weight="semibold" className="text-sm text-avoid-700">
          {t('ble.errorTitle')}
        </Text>
      </View>
      <Text className="text-sm leading-5 text-avoid-700">{t(`ble.err.${failure.code}`)}</Text>
      {SETTINGS_FIXABLE.has(failure.code) && (
        <Pressable onPress={() => void Linking.openSettings()} className="mt-3 py-1">
          <Text weight="semibold" className="text-sm text-brand-600">
            {t('ble.openSettings')} →
          </Text>
        </Pressable>
      )}
      {IS_DEV && failure.detail ? (
        <Text className="mt-2 text-xs text-avoid-700">{failure.detail}</Text>
      ) : null}
    </View>
  );
}

type PickerProps = {
  devices: DiscoveredDevice[];
  isScanning: boolean;
  hasFailure: boolean;
  connectingId: string | null;
  onPressDevice: (id: string) => void;
  onRescan: () => void;
  onStop: () => void;
};

/**
 * The device list. Every advertising device is shown, named or not: hiding the unnamed ones
 * was why the list looked empty — most peripherals, including an ESP32 and nRF Connect's
 * advertiser, send no name at all. The MAC address is the fallback label, and the signal
 * meter is how the farmer tells which row is the stick in front of them.
 */
function DevicePicker({
  devices,
  isScanning,
  hasFailure,
  connectingId,
  onPressDevice,
  onRescan,
  onStop,
}: PickerProps) {
  const { t } = useTranslation();
  const isEmpty = devices.length === 0;

  return (
    <>
      {isScanning && (
        <View className="mb-3 flex-row items-center justify-center" style={{ gap: 8 }}>
          <ActivityIndicator size="small" color={colors.brand[600]} />
          <Text className="text-sm text-ink-muted">{t('ble.scanning')}</Text>
        </View>
      )}

      {isScanning && isEmpty && (
        <View className="items-center py-8">
          <Text className="text-center text-sm text-ink-faint">{t('ble.scanningHint')}</Text>
        </View>
      )}

      {!isScanning && isEmpty && !hasFailure && (
        <View className="items-center py-6">
          <Ionicons name="search-outline" size={40} color={colors.ink.faint} />
          <Text weight="medium" className="mt-3 text-body text-ink">
            {t('ble.noneFoundTitle')}
          </Text>
          <Text className="mt-1 text-center text-sm text-ink-muted">
            {t('ble.noneFoundBody')}
          </Text>
        </View>
      )}

      {!isEmpty && (
        <>
          <Text className="mb-2 text-xs text-ink-faint">
            {t('ble.deviceCount', { count: devices.length })}
          </Text>
          <ScrollView className="max-h-72">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                busy={connectingId === device.id}
                disabled={connectingId !== null}
                onPress={() => onPressDevice(device.id)}
              />
            ))}
          </ScrollView>
        </>
      )}

      <Button
        className="mt-4"
        label={isScanning ? t('ble.stop') : t('ble.scanAgain')}
        variant={isScanning ? 'secondary' : 'primary'}
        icon={isScanning ? 'stop-circle-outline' : 'refresh-outline'}
        onPress={isScanning ? onStop : onRescan}
      />
    </>
  );
}

function DeviceRow({
  device,
  busy,
  disabled,
  onPress,
}: {
  device: DiscoveredDevice;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const label = device.name ?? t('ble.noName');

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${device.id}`}
      style={{ opacity: disabled && !busy ? 0.5 : 1 }}
    >
      <Card
        className={`mb-3 flex-row items-center p-3 ${device.isLikelyStick ? 'border-brand-600' : ''}`}
      >
        <View
          className={`mr-3 h-10 w-10 items-center justify-center rounded-pill ${
            device.isLikelyStick ? 'bg-grow-50' : 'bg-brand-50'
          }`}
        >
          <Ionicons
            name={device.isLikelyStick ? 'hardware-chip' : 'bluetooth-outline'}
            size={20}
            color={device.isLikelyStick ? colors.grow[600] : colors.brand[600]}
          />
        </View>
        <View className="flex-1">
          <Text weight="medium" className="text-body text-ink" numberOfLines={1}>
            {label}
          </Text>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-xs text-ink-muted">{device.id}</Text>
            {device.isLikelyStick && (
              <Text weight="semibold" className="text-xs text-grow-600">
                · {t('ble.likelyStick')}
              </Text>
            )}
          </View>
        </View>
        <View className="ml-2 items-end" style={{ gap: 4 }}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.brand[600]} />
          ) : (
            <Text weight="medium" className="text-sm text-brand-600">
              {t('ble.connect')}
            </Text>
          )}
          <SignalMeter rssi={device.rssi} />
        </View>
      </Card>
    </Pressable>
  );
}
