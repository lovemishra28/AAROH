/**
 * Display formatting. Pure, presentation-only — no agronomy maths ever happens here.
 *
 * Numbers are grouped the Indian way (₹8,930 / ₹1,24,500) because the audience reads
 * lakh/crore grouping, and we hand-roll it rather than rely on Intl.NumberFormat, which
 * is only partially implemented on Hermes.
 */

/** Groups the integer part with Indian digit separators: 1234567 → "12,34,567". */
function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Whole rupees with the ₹ symbol and Indian grouping. `1942` → "₹1,942". */
export function formatInr(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${groupIndian(String(rounded))}`;
}

/** Trims trailing zeros so 20.0 shows as "20" but 7.2 stays "7.2". */
export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded);
}

/** Area shown to the farmer: hectares with up to two decimals. */
export function formatHectares(areaHa: number | null | undefined): string {
  if (areaHa == null || !Number.isFinite(areaHa)) return '—';
  return `${formatNumber(areaHa, 2)} ha`;
}

/**
 * Ordinal cue instead of a raw score decimal (guide rule). We key the band off the crop's
 * rank *within its segment*, not the absolute score, because the ML score scale is not a
 * contract we can depend on — position is. Returns an i18n key under `advice.band.*`.
 */
export type ScoreBand = 'strong' | 'good' | 'fair';

export function scoreBandForIndex(index: number): ScoreBand {
  if (index <= 0) return 'strong';
  if (index === 1) return 'good';
  return 'fair';
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Date and time of a stored reading, in the device's local zone.
 *
 * Deliberately all-numeric (`29/08/2026 14:32`) rather than a localised month name: this
 * label exists so the farmer can tell two readings taken minutes apart from each other, and
 * a purely numeric form needs no month-name translation and no dependence on Hermes' partial
 * Intl support. 24-hour time avoids an am/pm string that would itself need translating.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Just the clock part, for rows already grouped under a date. */
export function formatClock(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** A measurement or an em dash — the one place "we have no value" is rendered. */
export function formatOrDash(value: number | null | undefined, maxDecimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatNumber(value, maxDecimals);
}

/** `26.2183, 78.1828` — five decimals is ~1 m, past which a phone GPS is noise. */
export function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
