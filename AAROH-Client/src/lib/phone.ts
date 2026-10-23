/**
 * Phone helpers.
 *
 * The server accepts `^\+?\d{10,15}$`. Indian farmers type a bare 10-digit mobile number,
 * so we normalise to E.164 with the +91 country code before sending, while keeping input
 * forgiving (spaces, dashes, a leading 0, or an existing +91 all work).
 */

const INDIA_CC = '91';

/** Strips formatting and returns just the digits (no +). */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Normalise user input to E.164 (e.g. "98765 43210" → "+919876543210").
 * Returns null if it cannot form a plausible number.
 */
export function normalizePhone(input: string): string | null {
  let d = digitsOnly(input);
  if (d.startsWith('0')) d = d.slice(1); // national trunk prefix
  if (d.length === 10) d = INDIA_CC + d; // bare 10-digit → prepend +91
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

/** True when the raw input can be normalised into an acceptable phone number. */
export function isValidPhone(input: string): boolean {
  const normalized = normalizePhone(input);
  return normalized !== null && /^\+\d{10,15}$/.test(normalized);
}
