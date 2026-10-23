import React, { useMemo, useState } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { Card, Text } from '@/components';
import { DevMockWalkCard } from '@/dev/DevMockWalkCard';
import { SyncScansCard } from '@/features/sync/SyncScansCard';
import { formatClock, formatCoords, formatDateTime, formatOrDash } from '@/lib/format';
import { pendingScans, useScanStore, type ScannedReading } from '@/store/scanStore';
import { colors } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

/**
 * The Scans section of the Analysis tab — every reading the stick has sent, newest first.
 *
 * This is the visible end of the BLE pipeline: a frame decoded by `FrameParser`, kept by
 * `scanStore`, shown here. Each row leads with the date and time because that is how the
 * farmer tells one probe point from the next, and the values sit under it in the same order
 * as the manual reading form so the two read alike.
 *
 * Each row also says whether the server has it yet. Without that, a phone-only scan and a
 * synced one look identical, and "did my walk upload?" becomes unanswerable — which matters
 * more now that uploading is what creates the farmer's fields.
 */

/** Rows shown before the list collapses behind "view all". */
const PREVIEW_COUNT = 5;

type Nav = NativeStackNavigationProp<AppStackParamList>;

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View className="mr-2 mt-2 rounded-pill bg-surface-sunken px-2.5 py-1">
      <Text className="text-xs text-ink-muted">
        {label} <Text weight="semibold" className="text-xs text-ink">{value}</Text>
      </Text>
    </View>
  );
}

function ScanRow({ scan, onLongPress }: { scan: ScannedReading; onLongPress: () => void }) {
  const { t } = useTranslation();
  const coords = formatCoords(scan.lat, scan.lng);
  const measured = scan.measured_at;
  const uploaded = scan.uploaded_at !== null;
  // Only worth showing when the stick's own clock disagrees with arrival by more than a
  // minute — otherwise it is the same instant twice and just noise.
  const showMeasured =
    measured !== null &&
    Math.abs(new Date(measured).getTime() - new Date(scan.received_at).getTime()) > 60_000;

  return (
    <Pressable accessibilityRole="button" onLongPress={onLongPress} delayLongPress={500}>
      <Card className="mt-3">
        <View className="flex-row items-center">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-pill bg-brand-50">
            <Ionicons name="hardware-chip-outline" size={18} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Text weight="semibold" className="text-body text-ink">
              {formatDateTime(scan.received_at)}
            </Text>
            <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
              {t('scans.probe')} {scan.probe_id} · {formatClock(scan.received_at)}
            </Text>
          </View>
          <View
            className={`ml-2 flex-row items-center rounded-pill px-2 py-1 ${
              uploaded ? 'bg-grow-50' : 'bg-surface-sunken'
            }`}
          >
            <Ionicons
              name={uploaded ? 'cloud-done-outline' : 'phone-portrait-outline'}
              size={12}
              color={uploaded ? colors.grow[600] : colors.ink.faint}
            />
            <Text
              weight="medium"
              className={`ml-1 text-xs ${uploaded ? 'text-grow-700' : 'text-ink-faint'}`}
            >
              {uploaded ? t('scans.uploaded') : t('scans.notUploaded')}
            </Text>
          </View>
        </View>

        <View className="mt-1 flex-row flex-wrap">
          <Chip label="N" value={formatOrDash(scan.n_mgkg)} />
          <Chip label="P" value={formatOrDash(scan.p_mgkg)} />
          <Chip label="K" value={formatOrDash(scan.k_mgkg)} />
          {scan.ph !== null ? <Chip label="pH" value={formatOrDash(scan.ph, 2)} /> : null}
          {scan.ec_uscm !== null ? <Chip label="EC" value={formatOrDash(scan.ec_uscm, 0)} /> : null}
          {scan.moisture_vwc !== null ? (
            <Chip label={t('reading.fields.moisture')} value={`${formatOrDash(scan.moisture_vwc)}%`} />
          ) : null}
          {scan.soil_temp_c !== null ? (
            <Chip label="T" value={`${formatOrDash(scan.soil_temp_c)}°C`} />
          ) : null}
        </View>

        <View className="mt-2 flex-row items-center">
          <Ionicons
            name={coords ? 'location-outline' : 'location'}
            size={13}
            color={coords ? colors.ink.muted : colors.ink.faint}
          />
          <Text className="ml-1 flex-1 text-xs text-ink-faint" numberOfLines={1}>
            {coords ?? t('scans.noGps')}
            {showMeasured ? ` · ${t('scans.measuredAt')} ${formatDateTime(measured)}` : ''}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export function ScansSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const items = useScanStore((s) => s.items);
  const clear = useScanStore((s) => s.clear);
  const remove = useScanStore((s) => s.remove);
  const fetchHistory = useScanStore((s) => s.fetchHistory);
  
  React.useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(
    () => (expanded ? items : items.slice(0, PREVIEW_COUNT)),
    [items, expanded]
  );
  
  const downloadTxt = async () => {
    if (items.length === 0) return;
    try {
      const header = 'Date                 | Probe | N         | P         | K         | pH   | EC         | Moist (%) | Temp (°C)\n' +
                     '-------------------------------------------------------------------------------------------------------------\n';
      const rows = items.map(scan => {
        const date = formatDateTime(scan.received_at).padEnd(20, ' ');
        const probe = (scan.probe_id ?? '-').padEnd(5, ' ');
        const n = formatOrDash(scan.n_mgkg).padEnd(9, ' ');
        const p = formatOrDash(scan.p_mgkg).padEnd(9, ' ');
        const k = formatOrDash(scan.k_mgkg).padEnd(9, ' ');
        const ph = formatOrDash(scan.ph, 2).padEnd(4, ' ');
        const ec = formatOrDash(scan.ec_uscm, 0).padEnd(10, ' ');
        const moist = formatOrDash(scan.moisture_vwc).padEnd(9, ' ');
        const temp = formatOrDash(scan.soil_temp_c).padEnd(9, ' ');
        return `${date} | ${probe} | ${n} | ${p} | ${k} | ${ph} | ${ec} | ${moist} | ${temp}`;
      }).join('\n');
      
      const fileUri = FileSystem.documentDirectory + 'Scans.txt';
      await FileSystem.writeAsStringAsync(fileUri, header + rows);
      await Sharing.shareAsync(fileUri, { dialogTitle: 'Download Scans', UTI: 'public.plain-text' });
    } catch (e) {
      console.error(e);
    }
  };

  const uploaded = useMemo(() => items.length - pendingScans(items).length, [items]);

  const openField = (fieldId: string) => navigation.navigate('FieldDetail', { fieldId });

  return (
    <View>
      <View className="border border-line rounded-xl overflow-hidden bg-surface-sunken">
        {/* Box Header */}
        <View className="flex-row items-center justify-between bg-surface px-4 py-3 border-b border-line">
          <View className="flex-row items-center gap-3">
            <Text weight="semibold" className="text-body-lg text-ink">
              {t('scans.title')}
            </Text>
          </View>
          {items.length > 0 ? (
            <View className="flex-row items-center gap-4">
              <Pressable accessibilityRole="button" onPress={downloadTxt} hitSlop={8}>
                <Ionicons name="download-outline" size={20} color={colors.brand[700]} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={clear} hitSlop={8}>
                <Text weight="medium" className="text-sm text-avoid-700">
                  {t('scans.clear')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {items.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="bluetooth-outline" size={26} color={colors.ink.faint} />
            <Text weight="semibold" className="mt-2 text-body text-ink">
              {t('scans.emptyTitle')}
            </Text>
            <Text className="mt-1 px-4 text-center text-sm text-ink-muted">
              {t('scans.emptyMessage')}
            </Text>
          </View>
        ) : (
          <ScrollView 
              nestedScrollEnabled 
              className="h-[280px]" 
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 }}
              showsVerticalScrollIndicator={true}
            >
              {visible.map((scan) => (
                <ScanRow key={scan.id} scan={scan} onLongPress={() => remove(scan.id)} />
              ))}
              {items.length > PREVIEW_COUNT ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-2 items-center py-2"
                  onPress={() => setExpanded((v) => !v)}
                >
                  <Text weight="medium" className="text-sm text-brand-700">
                    {expanded ? t('common.done') : t('common.viewAll')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
      </View>

      <DevMockWalkCard className="mt-5" />
    </View>
  );
}
