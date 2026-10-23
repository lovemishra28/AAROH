import { useEffect } from 'react';

import { bleService } from '@/lib/ble/BleService';
import { isStorableFrame, type ParsedFrame } from '@/lib/ble/FrameParser';
import { useScanStore } from '@/store/scanStore';

/**
 * Persists every reading the stick sends, for as long as the app is mounted.
 *
 * Mounted once, at the app root — not in a screen. A reading arrives whenever the farmer
 * presses the probe into the soil, which may well be while the Analysis tab isn't the
 * visible one, and losing it because no screen was listening would be indefensible.
 *
 * It subscribes to `BleService` directly rather than watching `useBle().latestFrame`.
 * That looks like a longer path to the same data, but React coalesces state updates: two
 * frames arriving in one tick would collapse into a single render and the first would never
 * be seen. The service calls the listener once per frame, so nothing is dropped.
 */
export function useScanCapture(): void {
  useEffect(() => {
    const listener = {
      onFrameReceived: (frame: ParsedFrame) => {
        // Same gate the live display uses, so what is shown and what is kept never diverge.
        if (!isStorableFrame(frame)) return;
        useScanStore.getState().record(frame);
      },
    };

    bleService.registerListener(listener);
    return () => bleService.unregisterListener(listener);
  }, []);
}
