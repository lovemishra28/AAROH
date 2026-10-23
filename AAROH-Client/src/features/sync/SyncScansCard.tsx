import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useFields } from '@/api/fields';
import { NoPendingScansError, useSyncScans } from '@/api/sync';
import type { SyncResult } from '@/api/types';
import { Button, Card, Text } from '@/components';
import { useBle } from '@/lib/ble/BleContext';
import { describeError, isOfflineError } from '@/lib/errors';
import { fieldLabel, fieldLabels } from '@/lib/fields';
import { pendingScans, useScanStore } from '@/store/scanStore';
import { colors } from '@/theme/tokens';

/**
 * "Connect stick & sync" — the dashboard's new primary action (Workstream 3).
 *
 * The old dashboard asked the farmer to create a field by hand and then type six soil
 * values into it. That order is backwards now: the stick already knows where it is, so
 * the farmer walks the plot, comes back into signal, and taps once. Fields, boundaries
 * and averages are the *output* of that tap, not a prerequisite for it.
 *
 * Which means this card carries an unusual duty for a button: it has to explain what
 * just happened to the farmer's map. A sync can silently invent two new fields and move
 * every average on screen, so the result is reported in full — what was saved, what was
 * already there, which fields were created, which were updated, and what was refused
 * and why. A field that appears without explanation is indistinguishable from a bug.
 */

type SyncScansCardProps = {
  /** Opens a field's detail screen. Omitted, the result rows are not tappable. */
  onOpenField?: (fieldId: string) => void;
  /** Opens the BLE picker, so a farmer with nothing to sync can connect the stick. */
  onConnect?: () => void;
  className?: string;
};

function Line({
  icon,
  color,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  children: string;
}) {
  return (
    <View className="mt-1.5 flex-row items-start">
      <View className="mt-0.5 mr-2">
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text className="flex-1 text-sm text-ink-muted">{children}</Text>
    </View>
  );
}

/**
 * What the sync did, in the order a farmer would ask it.
 *
 * Counts first (did my walk arrive?), then the fields (what changed on my map?), then
 * the problems (what did I lose?). Zero-value lines are omitted rather than shown as
 * "0", so the block shrinks to two lines on a clean sync.
 */
export function SyncResultSummary({
  result,
  onOpenField,
}: {
  result: SyncResult;
  onOpenField?: (fieldId: string) => void;
}) {
  const { t } = useTranslation();
  const { data: fields } = useFields();

  // Numbering has to come from the farmer's whole field list, not from this result:
  // a sync that touched only the third field must still call it "Field 3".
  const labels = useMemo(() => fieldLabels(fields ?? [], t), [fields, t]);

  const rejectedReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of result.rejected) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    return [...counts.entries()];
  }, [result.rejected]);

  return (
    <View className="mt-3 rounded-field bg-surface-sunken p-3">
      <Text weight="semibold" className="text-sm text-ink">
        {t('sync.resultTitle')}
      </Text>

      <Line icon="checkmark-circle" color={colors.grow[600]}>
        {t('sync.stored', { count: result.stored })}
      </Line>
      {result.duplicates > 0 ? (
        <Line icon="copy-outline" color={colors.ink.faint}>
          {t('sync.duplicates', { count: result.duplicates })}
        </Line>
      ) : null}
      {result.fields_created > 0 ? (
        <Line icon="map-outline" color={colors.brand[600]}>
          {t('sync.fieldsCreated', { count: result.fields_created })}
        </Line>
      ) : null}
      {result.fields_matched > 0 ? (
        <Line icon="refresh-outline" color={colors.brand[600]}>
          {t('sync.fieldsMatched', { count: result.fields_matched })}
        </Line>
      ) : null}

      {result.fields.map((summary) => {
        const label = fieldLabel(summary.field, t, labels);
        const badge = summary.created ? t('sync.fieldRowNew') : t('sync.fieldRowUpdated');
        return (
          <Pressable
            key={summary.field.id}
            accessibilityRole="button"
            disabled={!onOpenField}
            onPress={() => onOpenField?.(summary.field.id)}
            className="mt-2 flex-row items-center rounded-field bg-surface px-3 py-2"
          >
            <View className="flex-1">
              <Text weight="semibold" className="text-sm text-ink" numberOfLines={1}>
                {label}
              </Text>
              <Text className="text-xs text-ink-muted">
                {t('sync.fieldRowAdded', { count: summary.readings_added })}
              </Text>
            </View>
            <View
              className={`ml-2 rounded-pill px-2 py-0.5 ${
                summary.created ? 'bg-grow-50' : 'bg-brand-50'
              }`}
            >
              <Text
                weight="medium"
                className={`text-xs ${summary.created ? 'text-grow-700' : 'text-brand-700'}`}
              >
                {badge}
              </Text>
            </View>
            {onOpenField ? (
              <View className="ml-1">
                <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {result.unassigned > 0 ? (
        <Line icon="help-circle-outline" color={colors.invest[600]}>
          {t('sync.unassigned', { count: result.unassigned })}
        </Line>
      ) : null}

      {result.warnings.length > 0 ? (
        <Line icon="locate-outline" color={colors.invest[600]}>
          {t('sync.warned', { count: result.warnings.length })}
        </Line>
      ) : null}

      {result.rejected.length > 0 ? (
        <>
          <Line icon="alert-circle-outline" color={colors.avoid[600]}>
            {t('sync.rejected', { count: result.rejected.length })}
          </Line>
          {rejectedReasons.map(([reason, count]) => (
            <Text key={reason} className="mt-0.5 pl-6 text-xs text-ink-faint">
              {count > 1 ? `${count} × ` : ''}
              {t(`sync.reason.${reason}`, { defaultValue: t('sync.reason.unknown') })}
            </Text>
          ))}
          <Text className="mt-1 pl-6 text-xs text-ink-faint">{t('sync.rejectedHint')}</Text>
        </>
      ) : null}

      {result.device_owned_by_other ? (
        <Line icon="information-circle-outline" color={colors.invest[600]}>
          {t('sync.deviceOtherOwner')}
        </Line>
      ) : null}
    </View>
  );
}

export function SyncScansCard({ onOpenField, onConnect, className }: SyncScansCardProps) {
  const { t } = useTranslation();
  const items = useScanStore((s) => s.items);
  const sync = useSyncScans();
  const { state, pendingStickReadings, requestSync, syncState } = useBle();

  const isConnected = state === 'Connected';
  const hasStickPending = pendingStickReadings > 0;

  const pending = useMemo(() => pendingScans(items).length, [items]);
  const hasPending = pending > 0;

  let defaultLabel = t('home.connectSync');
  let defaultVariant = 'outline';
  let defaultIcon = 'bluetooth-outline';

  if (hasStickPending) {
    defaultLabel = t('stickSync.syncActionCount', { count: pendingStickReadings });
    defaultVariant = 'primary';
    defaultIcon = 'cloud-download-outline';
  } else if (hasPending) {
    defaultLabel = t('sync.uploadActionCount', { count: pending });
    defaultVariant = 'outline';
    defaultIcon = 'cloud-upload-outline';
  } else if (isConnected) {
    defaultLabel = t('home.connectedAndReady');
    defaultVariant = 'primary';
    defaultIcon = 'bluetooth';
  }

  const errorText =
    sync.error === null || sync.error === undefined
      ? null
      : sync.error instanceof NoPendingScansError
        ? t('sync.nothingToSync')
        : isOfflineError(sync.error)
          ? t('sync.offlineBlocked')
          : describeError(sync.error, t);

  return (
    <View className={className}>
      
      <Button
        label={defaultLabel}
        icon={defaultIcon as any}
        variant={defaultVariant as any}
        loading={sync.isPending || syncState === 'syncing'}
        disabled={(!hasPending && !hasStickPending && !onConnect) || syncState === 'syncing'}
        onPress={() => {
          if (hasStickPending) {
            void requestSync();
          } else if (hasPending) {
            sync.mutate();
          } else {
            onConnect?.();
          }
        }}
      />

      {errorText ? <Text className="mt-2 text-sm text-avoid-700">{errorText}</Text> : null}

      {sync.data ? (
        <SyncResultSummary result={sync.data.result} onOpenField={onOpenField} />
      ) : null}
    </View>
  );
}
