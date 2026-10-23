import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { describeError, isOfflineError } from '@/lib/errors';
import { colors } from '@/theme/tokens';

import { Button } from './Button';
import { Text } from './Text';

/**
 * The four designed states every data screen owes the user (guide §10): loading, empty,
 * error, offline. Centralising them here means no screen invents its own, and the offline
 * case is always distinguished from a real error (calm "you're offline", not a red alarm).
 */

type IoniconName = keyof typeof Ionicons.glyphMap;

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <ActivityIndicator color={colors.brand[600]} />
      <Text className="mt-3 text-body text-ink-muted">{label ?? t('common.loading')}</Text>
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
}: {
  icon?: IoniconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-50">
        <Ionicons name={icon} size={30} color={colors.brand[500]} />
      </View>
      <Text weight="semibold" className="mt-4 text-body-lg text-ink">
        {title}
      </Text>
      {message ? (
        <Text className="mt-1 text-center text-body text-ink-muted">{message}</Text>
      ) : null}
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const offline = isOfflineError(error);
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View
        className="h-16 w-16 items-center justify-center rounded-pill"
        style={{ backgroundColor: offline ? colors.info[50] : colors.avoid[50] }}
      >
        <Ionicons
          name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
          size={30}
          color={offline ? colors.info[600] : colors.avoid[600]}
        />
      </View>
      <Text weight="semibold" className="mt-4 text-center text-body-lg text-ink">
        {offline ? t('states.offlineTitle') : t('states.errorTitle')}
      </Text>
      <Text className="mt-1 text-center text-body text-ink-muted">{describeError(error, t)}</Text>
      {onRetry ? (
        <Button
          label={t('common.retry')}
          variant="secondary"
          icon="refresh-outline"
          className="mt-5"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

/**
 * Picks the right state for a TanStack Query result. When a persisted cache exists the
 * query returns `data` even while offline, so we render `children` and let a SyncBanner
 * (M8) carry the "stale/offline" nuance rather than blocking the whole screen.
 */
export function QueryBoundary({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
