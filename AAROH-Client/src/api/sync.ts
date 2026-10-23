import { useMutation, useQueryClient } from '@tanstack/react-query';

import { pendingScans, useScanStore, type ScannedReading } from '@/store/scanStore';

import { api } from './client';
import { qk } from './keys';
import type { SyncBatchInput, SyncReadingInput, SyncResult } from './types';

/**
 * Sending a walk to the server (Workstream 2, client half).
 *
 * `POST /v1/readings/sync` is the one write in the app that does not name a field.
 * The phone sends points with coordinates; the server clusters them, creates or
 * matches a field per cluster, draws the boundary and recomputes the means. So this
 * module deliberately contains **no** notion of which field a scan belongs to — if it
 * did, there would be two answers to that question and they would eventually differ.
 *
 * Retry safety comes from `idempotency_key`, which is the scan's local id. Re-sending
 * a batch whose response was lost stores nothing twice; the server reports those
 * points as `duplicates`, which is a success, not an error.
 */

/**
 * The server's own cap on one batch (`MAX_SYNC_READINGS`). Mirrored rather than
 * imported for the obvious reason, and set to the same number so a full local log
 * always goes in one request — a batch split in two could put the two halves of one
 * walk into two clusters and, at the boundary, two fields.
 */
const MAX_BATCH = 500;

/** Scan row → wire shape. */
function toSyncReading(scan: ScannedReading): SyncReadingInput {
  return {
    idempotency_key: scan.id,
    // The stick's own clock when it has one, the phone's arrival time otherwise. Never
    // "now": these points may have been walked an hour before there was any signal.
    taken_at: scan.measured_at ?? scan.received_at,
    session_id: scan.session_id,
    lat: scan.lat,
    lng: scan.lng,
    n_mgkg: scan.n_mgkg,
    p_mgkg: scan.p_mgkg,
    k_mgkg: scan.k_mgkg,
    ph: scan.ph,
    ec_uscm: scan.ec_uscm,
    moisture_vwc: scan.moisture_vwc,
    soil_temp_c: scan.soil_temp_c,
    raw_frame: scan.raw_frame,
  };
}

/**
 * Which stick to credit the batch to. The newest scan wins, because that is the stick
 * in the farmer's hand; the server claims an unregistered serial for this farmer and
 * never reassigns one that already belongs to someone else.
 */
function deviceOf(scans: readonly ScannedReading[]): SyncBatchInput['device'] {
  const newest = scans[scans.length - 1];
  if (!newest?.probe_id) return undefined;
  return { serial: newest.probe_id, firmware_version: newest.firmware_version };
}

export function buildSyncBatch(scans: readonly ScannedReading[]): SyncBatchInput | null {
  const batch = scans.slice(0, MAX_BATCH);
  if (batch.length === 0) return null;
  return { device: deviceOf(batch), readings: batch.map(toSyncReading) };
}

export type SyncScansOutcome = {
  result: SyncResult;
  /** Local scan ids the server accepted — what `markUploaded` was called with. */
  confirmed: string[];
};

/**
 * Uploads every scan that has not been confirmed yet.
 *
 * The mutation takes no argument: what to send is whatever the local log still owes
 * the server, so a screen cannot accidentally send a stale selection. It throws
 * `NoPendingScansError` rather than silently succeeding on an empty log, because a
 * button that reports success without doing anything teaches the farmer to distrust
 * it.
 */
export class NoPendingScansError extends Error {
  constructor() {
    super('No scans are waiting to sync.');
    this.name = 'NoPendingScansError';
  }
}

export function useSyncScans() {
  const qc = useQueryClient();

  return useMutation<SyncScansOutcome, unknown, void>({
    mutationFn: async () => {
      const scans = pendingScans(useScanStore.getState().items).slice(0, MAX_BATCH);
      const batch = buildSyncBatch(scans);
      if (!batch) throw new NoPendingScansError();

      const result = await api.post<SyncResult>('/v1/readings/sync', batch);

      // Confirmed = sent minus rejected. Deliberately not "everything we sent": a
      // rejected point must stay pending so it is visible and re-sendable, and
      // deliberately not "stored" either, since a duplicate is already safely stored.
      const rejected = new Set(result.rejected?.map((r) => r.idempotency_key) ?? []);
      const confirmed = scans.map((s) => s.id).filter((id) => !rejected.has(id));

      useScanStore.getState().markUploaded(confirmed);
      return { result, confirmed };
    },

    onSuccess: ({ result }) => {
      // Fields, their readings and their aggregates have all just changed server-side;
      // the dashboard reads all three, so refetch rather than patch. `['field', id]` is
      // a prefix, so one invalidation per touched field sweeps its readings and advice.
      void qc.invalidateQueries({ queryKey: qk.fields });
      for (const summary of result.fields) {
        void qc.invalidateQueries({ queryKey: qk.field(summary.field.id) });
      }
    },
  });
}
