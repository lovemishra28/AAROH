import { toByteArray, fromByteArray } from 'base64-js';

/**
 * Frame decoding for the Aaroh sensing stick.
 *
 * The wire format is documented in `BLE_PROTOCOL.md`. In short: one reading per line,
 * `KEY:value` pairs separated by commas, terminated by `\n`. Unknown keys are ignored and
 * missing keys become `null` — that combination is what lets a v2 firmware add a sensor
 * without breaking an older app, and an older firmware keep working against a newer app.
 *
 * Nothing here touches `react-native-ble-plx`: the parser takes a string and returns a
 * domain object, which makes it testable without a radio.
 */

/** Highest frame version this build understands. */
export const SUPPORTED_FRAME_VERSION = 1;

/**
 * One parsed probe reading.
 *
 * Units are in the field names on purpose (see the client README non-negotiables): N/P/K
 * are elemental mg/kg, EC is µS/cm, moisture is volumetric water content in %.
 */
export interface ProbeReading {
  raw_frame: string;
  n_mgkg: number | null;
  p_mgkg: number | null;
  k_mgkg: number | null;
  ph: number | null;
  ec_uscm: number | null;
  moisture_vwc: number | null;
  soil_temp_c: number | null;
  lat: number | null;
  lng: number | null;
  timestamp: Date | null;
}

export interface FrameMetadata {
  probe_id: string;
  firmware_version: string;
  /** Frame-format version from the `V` key. Absent on v1 firmware, which predates it. */
  frame_version: number;
  /** `SID` — groups the multiple points of one walk-the-field session. */
  session_id: string | null;
  /** `MDL` — hardware model, so a future probe variant is distinguishable server-side. */
  device_model: string | null;
  /**
   * Keys the firmware sent that this build has no field for. Kept rather than dropped so a
   * field bug report shows what a newer stick was trying to say.
   */
  unknown_keys: string[];
}

export interface ParsedFrame {
  metadata: FrameMetadata;
  reading: ProbeReading;
}

/**
 * A control frame from the stick — not a soil reading, but a protocol message.
 * `CMD:STATUS,COUNT:5` tells the app how many readings the stick has stored.
 * `CMD:SYNC_DONE` signals that the stick has finished sending stored readings.
 */
export interface ControlFrame {
  probe_id: string;
  firmware_version: string;
  command: 'STATUS' | 'SYNC_DONE' | string;
  count: number | null;
  raw_frame: string;
}

/** Every key this version consumes; anything else lands in `unknown_keys`. */
const KNOWN_KEYS = new Set([
  'V',
  'ID',
  'FW',
  'SID',
  'MDL',
  'N',
  'P',
  'K',
  'pH',
  'EC',
  'M',
  'T',
  'Lat',
  'Lng',
  'TS',
  'CMD',
  'COUNT',
]);

/** Base64 (as BLE characteristics carry it) → plain string. */
export function decodeBase64(base64: string): string {
  try {
    const bytes = toByteArray(base64);
    let out = '';
    // Chunked to stay clear of the argument-count limit on String.fromCharCode for the
    // large payloads a 512-byte MTU makes possible.
    for (let i = 0; i < bytes.length; i += 1024) {
      out += String.fromCharCode(...bytes.subarray(i, i + 1024));
    }
    return out;
  } catch {
    return '';
  }
}

/** Plain ASCII string → base64, for writes to the command characteristic. */
export function encodeBase64(value: string): string {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return fromByteArray(bytes);
}

function parseNum(value: string | undefined): number | null {
  if (value === undefined) return null;
  // Whitespace is never significant in this format, and a value typed by hand into a test
  // tool routinely picks some up (`78.182 8`). Stripping it is safe: no valid value
  // contains a space, so anything left that fails Number() was genuinely garbage.
  const cleaned = value.replace(/\s+/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses one frame. Returns `null` — never throws — for anything unusable, because this
 * runs inside a BLE notification callback where a throw would kill the subscription.
 *
 * Example v1 frame:
 * `ID:P123,FW:1.0.2,N:100.5,P:20.1,K:30.0,pH:7.1,EC:1200,M:15,T:24.5,Lat:26.223,Lng:78.112,TS:1693353600`
 *
 * Example v2-shaped frame (extra keys are tolerated, not required):
 * `V:2,ID:P123,FW:2.0.0,MDL:AP-S1,SID:a91f,N:100.5,...,ZN:4.2`
 */
export function parseFrame(frame: string): ParsedFrame | null {
  if (!frame || typeof frame !== 'string') return null;

  const map: Record<string, string> = {};
  const unknown: string[] = [];

  for (const pair of frame.trim().split(',')) {
    // Split on the FIRST colon only: a value may legitimately contain one (an ISO
    // timestamp, a MAC-style model string), and `split(':')` would silently truncate it.
    const sep = pair.indexOf(':');
    if (sep <= 0) continue;
    const key = pair.slice(0, sep).trim();
    const value = pair.slice(sep + 1).trim();
    if (!key) continue;
    if (!KNOWN_KEYS.has(key)) {
      unknown.push(key);
      continue;
    }
    map[key] = value;
  }

  // The probe id is the one field with no sensible default, so its absence is the test
  // for "this was not an Aaroh frame at all".
  const probeId = map['ID'];
  if (!probeId) return null;

  const version = parseNum(map['V']) ?? 1;
  const tsNum = parseNum(map['TS']);

  const reading: ProbeReading = {
    raw_frame: frame,
    n_mgkg: parseNum(map['N']),
    p_mgkg: parseNum(map['P']),
    k_mgkg: parseNum(map['K']),
    ph: parseNum(map['pH']),
    ec_uscm: parseNum(map['EC']),
    moisture_vwc: parseNum(map['M']),
    soil_temp_c: parseNum(map['T']),
    lat: parseNum(map['Lat']),
    lng: parseNum(map['Lng']),
    // Firmware sends Unix seconds. A stick with no RTC and no GPS fix sends nothing, in
    // which case the phone's clock is the best available answer.
    timestamp: tsNum !== null ? new Date(tsNum * 1000) : new Date(),
  };

  // An `ID:` with no sensor value behind it is a truncated fragment, not a reading — a
  // frame cut at the wrong place used to surface as a phantom reading with every value
  // null. Requiring one measurement makes the distinction, and the protocol has no
  // legitimate frame that carries none.
  const hasAnyMeasurement =
    reading.n_mgkg !== null ||
    reading.p_mgkg !== null ||
    reading.k_mgkg !== null ||
    reading.ph !== null ||
    reading.ec_uscm !== null ||
    reading.moisture_vwc !== null ||
    reading.soil_temp_c !== null;
  if (!hasAnyMeasurement) return null;

  return {
    metadata: {
      probe_id: probeId,
      firmware_version: map['FW'] ?? 'unknown',
      frame_version: version,
      session_id: map['SID'] ?? null,
      device_model: map['MDL'] ?? null,
      unknown_keys: unknown,
    },
    reading,
  };
}

/**
 * Try to parse a frame as a control message (CMD:STATUS, CMD:SYNC_DONE).
 * Returns null if this is a regular sensor frame rather than a control frame.
 */
export function parseControlFrame(frame: string): ControlFrame | null {
  if (!frame || typeof frame !== 'string') return null;

  const map: Record<string, string> = {};
  for (const pair of frame.trim().split(',')) {
    const sep = pair.indexOf(':');
    if (sep <= 0) continue;
    const key = pair.slice(0, sep).trim();
    const value = pair.slice(sep + 1).trim();
    if (key) map[key] = value;
  }

  const cmd = map['CMD'];
  if (!cmd) return null;

  return {
    probe_id: map['ID'] ?? 'unknown',
    firmware_version: map['FW'] ?? 'unknown',
    command: cmd,
    count: map['COUNT'] !== undefined ? (parseFloat(map['COUNT']) || 0) : null,
    raw_frame: frame,
  };
}

/** True when the frame came from a firmware whose format this build was written against. */
export function isSupportedVersion(frame: ParsedFrame): boolean {
  return frame.metadata.frame_version <= SUPPORTED_FRAME_VERSION;
}

/**
 * The single gate for "this frame is worth keeping". Both the live session state and the
 * on-device scan log ask this, so a frame can never be shown but not stored (or the
 * reverse) — that divergence is the sort of thing only a field report would catch.
 */
export function isStorableFrame(frame: ParsedFrame): boolean {
  return isSupportedVersion(frame) && isValidReading(frame.reading);
}

/**
 * Whether a reading is worth storing and sending. N, P and K are required because the
 * recommendation engine cannot run without them; the rest are range-checked only when
 * present, so a stick with no GPS or no thermistor still produces a usable reading.
 */
export function isValidReading(reading: ProbeReading): boolean {
  if (reading.n_mgkg === null || reading.p_mgkg === null || reading.k_mgkg === null) {
    return false;
  }
  if (reading.n_mgkg < 0 || reading.p_mgkg < 0 || reading.k_mgkg < 0) return false;

  if (reading.ph !== null && (reading.ph < 0 || reading.ph > 14)) return false;
  if (reading.ec_uscm !== null && reading.ec_uscm < 0) return false;
  if (reading.moisture_vwc !== null && (reading.moisture_vwc < 0 || reading.moisture_vwc > 100))
    return false;
  // Ambient soil outside this band means a broken probe, not a remarkable field.
  if (reading.soil_temp_c !== null && (reading.soil_temp_c < -20 || reading.soil_temp_c > 90))
    return false;
  if (reading.lat !== null && (reading.lat < -90 || reading.lat > 90)) return false;
  if (reading.lng !== null && (reading.lng < -180 || reading.lng > 180)) return false;

  return true;
}
