import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components';
import { colors } from '@/theme/tokens';

import { loadMockWalk, type MockWalkResult } from './loadMockWalk';
import { MOCK_WALK_FRAMES, MOCK_WALK_PLOTS, MOCK_WALK_SOURCE } from './mockFrames';

/**
 * Developer-only card that loads the bundled demo walk into the scan log.
 *
 * Renders nothing outside a development build, so the call site needs no `__DEV__` guard of
 * its own and there is exactly one place to check. The frame data it imports is a few
 * kilobytes of strings; that rides along in a release bundle, which is a fair price for the
 * guard living in one place instead of at every call site.
 *
 * It states what the load should produce — three plots, three fields after a sync — because
 * the whole point is to check that the server agrees. A test fixture that doesn't say what
 * it expects only tells you something happened.
 */
export function DevMockWalkCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MockWalkResult | null>(null);



  const load = () => {
    setBusy(true);
    void loadMockWalk()
      .then(setResult)
      .finally(() => setBusy(false));
  };

  return (
    <Card className={`border-dashed ${className ?? ''}`}>
      <View className="flex-row items-center">
        <Ionicons name="construct-outline" size={16} color={colors.ink.muted} />
        <Text weight="semibold" className="ml-2 flex-1 text-body text-ink">
          {t('scans.loadMock')}
        </Text>
      </View>

      <Text className="mt-1 text-xs text-ink-muted">{t('scans.loadMockHint')}</Text>
      <Text className="mt-1 text-xs text-ink-faint">
        {t('scans.loadMockExpect', {
          readings: MOCK_WALK_FRAMES.length,
          plots: MOCK_WALK_PLOTS.length,
        })}
      </Text>
      <Text className="mt-0.5 text-xs text-ink-faint">{MOCK_WALK_SOURCE}</Text>

      {result ? (
        <Text weight="medium" className="mt-2 text-xs text-grow-700">
          {result.stored > 0
            ? t('scans.loadMockDone', { count: result.stored })
            : t('scans.loadMockAlready')}
          {result.rejected > 0 ? ` · ${t('scans.loadMockRejected', { count: result.rejected })}` : ''}
        </Text>
      ) : null}

      <Button
        label={t('scans.loadMock')}
        icon="download-outline"
        variant="secondary"
        loading={busy}
        className="mt-3"
        onPress={load}
      />
    </Card>
  );
}
