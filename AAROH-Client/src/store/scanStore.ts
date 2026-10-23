import { create } from 'zustand';

import type { ParsedFrame } from '@/lib/ble/FrameParser';
import { newId } from '@/lib/id';
import { api } from '@/api/client';
import type { HistoryReading } from '@/api/types';
import { loadJson, removeJson, saveJson } from '@/lib/secureStore';

/**
 * On-device log of readings received from the sensing stick over BLE.
 *
 * This is the missing half of Workstream 1: `BleContext` already decodes frames into a
 * typed domain model, but until now nothing kept them, so a reading vanished the moment
 * the modal closed. Every valid frame now lands here, survives an app restart, and is what
 * the Analysis tab lists.
 *
 * It is deliberately *not* the outbox. The outbox holds writes the farmer authored against
 * a known field; a scan has no field — deciding which field a GPS point belongs to is the
 * server's job (`POST /v1/readings/sync` clusters the coordinates). So scans accumulate here
 * with their coordinates intact, and `uploaded_at` is stamped only once the server has
 * confirmed that point, which is what makes a sync safe to retry.
 */

const SCANS_KEY = 'agropulse.scans.v1';

/**
 * How many scans are kept. SecureStore is not built for bulk data (Expo warns past ~2 KB),
 * and this list is the largest thing we put through it, so the cap is what keeps the
 * payload in the tens of kilobytes. A long walk-the-field session will eventually want a
 * real file or SQLite; the store's public surface is small enough to swap underneath.
 */
const MAX_SCANS = 100;

/**
 * How much of the raw frame is kept per scan. The frame is the stick's own words and the
 * only audit trail if a value ever looks wrong, so it is worth the bytes — but not
 * unbounded bytes in a store this size. Long enough for any v1/v2 frame; the server accepts
 * up to 2000 characters and stores what we send.
 */
const MAX_RAW_FRAME_CHARS = 200;

/**
 * A stick reading, as stored. Flat and JSON-only on purpose: `ParsedFrame` holds a `Date`,
 * which does not survive a JSON round-trip, so timestamps are ISO strings here and the
 * conversion happens once, in `fromFrame`.
 */
export type ScannedReading = {
  /** Local id — the server has never seen this reading. */
  id: string;
  /** When the phone received the frame. Always present; this is what the list sorts on. */
  received_at: string;
  /** When the stick says it measured (`TS`). Null when the stick has no clock. */
  measured_at: string | null;
  probe_id: string;
  firmware_version: string;
  device_model: string | null;
  /** `SID` — groups the points of one walk of a field, when the firmware sends it. */
  session_id: string | null;
  n_mgkg: number | null;
  p_mgkg: number | null;
  k_mgkg: number | null;
  ph: number | null;
  ec_uscm: number | null;
  moisture_vwc: number | null;
  soil_temp_c: number | null;
  lat: number | null;
  lng: number | null;
  /** The frame exactly as the stick sent it, truncated. Provenance, not data. */
  raw_frame: string | null;
  /** Set once the server has stored this point. Null means "still local only". */
  uploaded_at: string | null;
};

/**
 * A frame delivered twice (BLE retries, or nRF Connect's notify button pressed on an
 * unchanged value) should not read as two measurements. Identical raw text inside this
 * window is treated as one. Wider than a duplicate notification, narrower than a human
 * deliberately re-sending the same test frame to see a second row appear.
 */
const DUPLICATE_WINDOW_MS = 1_500;

type ScanState = {
  items: ScannedReading[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Fetch past scans from the server and merge them into the local store. */
  fetchHistory: () => Promise<void>;
  /** Store one decoded frame. Returns the row, or null when it was a duplicate. */
  record: (frame: ParsedFrame) => ScannedReading | null;
  /**
   * Stamp `uploaded_at` on the scans the server has confirmed.
   *
   * Only the ids the server acknowledged, never "everything we just sent": a batch can be
   * partly rejected (a probe lifted out of the soil reads pH 0.4), and marking a rejected
   * point as uploaded would quietly lose it — it would never be retried and never be seen
   * again.
   */
  markUploaded: (ids: readonly string[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: () => number;
};

function persist(items: ScannedReading[]): void {
  void saveJson(SCANS_KEY, items);
}

/** Scans the server has not confirmed yet, oldest first — the order a walk happened in. */
export function pendingScans(items: readonly ScannedReading[]): ScannedReading[] {
  return items
    .filter((r) => r.uploaded_at === null)
    .sort((a, b) => a.received_at.localeCompare(b.received_at));
}

/** `ParsedFrame` → storable row. The one place BLE shapes become app shapes. */
function fromFrame(frame: ParsedFrame): ScannedReading {
  const { metadata, reading } = frame;
  return {
    id: newId(),
    received_at: new Date().toISOString(),
    measured_at: reading.timestamp ? reading.timestamp.toISOString() : null,
    probe_id: metadata.probe_id,
    firmware_version: metadata.firmware_version,
    device_model: metadata.device_model,
    session_id: metadata.session_id,
    n_mgkg: reading.n_mgkg,
    p_mgkg: reading.p_mgkg,
    k_mgkg: reading.k_mgkg,
    ph: reading.ph,
    ec_uscm: reading.ec_uscm,
    moisture_vwc: reading.moisture_vwc,
    soil_temp_c: reading.soil_temp_c,
    lat: reading.lat,
    lng: reading.lng,
    raw_frame: reading.raw_frame ? reading.raw_frame.slice(0, MAX_RAW_FRAME_CHARS) : null,
    uploaded_at: null,
  };
}

/**
 * Raw-frame fingerprints keyed by frame text, used only for duplicate suppression. Kept
 * outside the store because it is transient bookkeeping, not state any screen renders.
 */
const lastSeenRaw = new Map<string, number>();

export const useScanStore = create<ScanState>()((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    const stored = await loadJson<ScannedReading[]>(SCANS_KEY);
    // Defend against a shape change between app versions: anything that isn't an array of
    // objects with a `received_at` is discarded rather than crashing the list renderer.
    const items = Array.isArray(stored)
      ? stored.filter((r): r is ScannedReading => !!r && typeof r.received_at === 'string')
      : [];
    set({ items, hydrated: true });
  },

  fetchHistory: async () => {
    try {
      const history = await api.get<HistoryReading[]>('/v1/readings/history');
      const serverItems: ScannedReading[] = history.map((r) => ({
        id: r.id,
        received_at: r.taken_at,
        measured_at: r.taken_at, // HistoryReading has taken_at
        probe_id: r.device_serial ?? 'Unknown',
        firmware_version: r.device_firmware_version ?? 'Unknown',
        device_model: null,
        session_id: r.session_id,
        n_mgkg: r.n_mgkg,
        p_mgkg: r.p_mgkg,
        k_mgkg: r.k_mgkg,
        ph: r.ph,
        ec_uscm: r.ec_uscm,
        moisture_vwc: r.moisture_vwc,
        soil_temp_c: r.soil_temp_c,
        lat: r.location?.coordinates[1] ?? null,
        lng: r.location?.coordinates[0] ?? null,
        raw_frame: r.raw_frame,
        uploaded_at: r.created_at,
      }));

      const current = get().items;
      // Keep any pending scans that haven't been uploaded yet
      const unuploaded = current.filter((r) => r.uploaded_at === null);
      
      // Map out all IDs to avoid duplicates
      const unuploadedIds = new Set(unuploaded.map((r) => r.id));
      const newItems = [...unuploaded, ...serverItems.filter((r) => !unuploadedIds.has(r.id))];
      
      // Sort newest first
      newItems.sort((a, b) => b.received_at.localeCompare(a.received_at));
      
      const items = newItems.slice(0, MAX_SCANS);
      set({ items });
      persist(items);
    } catch (e) {
      // Offline or server down; just retain local state
      console.warn('Failed to fetch scan history', e);
    }
  },

  record: (frame) => {
    const now = Date.now();
    const raw = frame.reading.raw_frame;
    const seenAt = lastSeenRaw.get(raw);
    if (seenAt !== undefined && now - seenAt < DUPLICATE_WINDOW_MS) return null;
    lastSeenRaw.set(raw, now);
    // The map is only a short-term window, so drop entries older than it rather than
    // letting a long session grow one entry per distinct frame.
    for (const [key, at] of lastSeenRaw) {
      if (now - at >= DUPLICATE_WINDOW_MS) lastSeenRaw.delete(key);
    }

    const row = fromFrame(frame);
    // Newest first: the list is read top-down and the farmer cares about what just arrived.
    const items = [row, ...get().items].slice(0, MAX_SCANS);
    set({ items });
    persist(items);
    return row;
  },

  markUploaded: (ids) => {
    if (ids.length === 0) return;
    const confirmed = new Set(ids);
    const at = new Date().toISOString();
    let changed = false;
    const items = get().items.map((r) => {
      if (!confirmed.has(r.id) || r.uploaded_at !== null) return r;
      changed = true;
      return { ...r, uploaded_at: at };
    });
    // A sync that confirmed only already-uploaded points must not rewrite storage.
    if (!changed) return;
    set({ items });
    persist(items);
  },

  remove: (id) => {
    const items = get().items.filter((r) => r.id !== id);
    set({ items });
    persist(items);
  },

  clear: () => {
    set({ items: [] });
    lastSeenRaw.clear();
    void removeJson(SCANS_KEY);
  },

  count: () => get().items.length,
}));
