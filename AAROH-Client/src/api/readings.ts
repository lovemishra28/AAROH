import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { qk } from './keys';
import { useConnectivityStore } from '@/store/connectivityStore';
import { useOutboxStore } from '@/store/outboxStore';
import { newId } from '@/lib/id';
import type {
  FieldDetailResult,
  Reading,
  ReadingInput,
  ReadingsIngestResult,
} from './types';

/**
 * Readings data layer (M5 + M8).
 *
 * The write is `POST /v1/readings` with `source:"manual"` and an on-device
 * `idempotency_key`, so a retry — or an outbox drain — never creates a duplicate. The
 * caller builds the full payload (it owns the dS/m→µS/cm conversion and the key).
 *
 * M8: when the device is offline the mutation enqueues the payload in the outbox and
 * updates the field's caches optimistically, so a farmer standing in a field with no signal
 * still sees the reading land and can move straight to advice once back online. The result
 * carries `queued` so the screen can say "saved on your phone, will sync" instead of a lie.
 */

export type SubmitReadingResult = { queued: boolean; result?: ReadingsIngestResult };

export function useFieldReadings(id: string) {
  return useQuery({
    queryKey: qk.fieldReadings(id),
    queryFn: () => api.get<{ readings: Reading[] }>(`/v1/fields/${id}/readings`),
    select: (r) => r.readings,
    enabled: Boolean(id),
  });
}

/** Builds the optimistic Reading we show locally before the server assigns the real one. */
function optimisticReading(payload: ReadingInput): Reading {
  return {
    ...payload,
    id: `local-${newId()}`,
    location: null,
    created_at: new Date().toISOString(),
  };
}

export function useSubmitReading(fieldId: string) {
  const qc = useQueryClient();

  return useMutation<SubmitReadingResult, unknown, ReadingInput>({
    mutationFn: async (payload) => {
      const online = useConnectivityStore.getState().isOnline;

      if (!online) {
        // Queue for later and reflect it locally right now.
        useOutboxStore.getState().enqueueReading({
          id: newId(),
          fieldId,
          payload,
          createdAt: new Date().toISOString(),
        });

        const local = optimisticReading(payload);
        qc.setQueryData<{ readings: Reading[] }>(qk.fieldReadings(fieldId), (prev) =>
          prev ? { readings: [local, ...prev.readings] } : { readings: [local] },
        );
        qc.setQueryData<FieldDetailResult>(qk.field(fieldId), (prev) =>
          prev ? { ...prev, latest_reading: local } : prev,
        );
        return { queued: true };
      }

      const result = await api.post<ReadingsIngestResult>('/v1/readings', payload, {
        idempotencyKey: payload.idempotency_key,
      });
      return { queued: false, result };
    },
    onSuccess: ({ queued }) => {
      if (queued) return; // offline path already updated the caches
      void qc.invalidateQueries({ queryKey: qk.field(fieldId) });
      void qc.invalidateQueries({ queryKey: qk.fieldReadings(fieldId) });
    },
  });
}
