/**
 * Validation helpers for the email/password/name fields on the Login & Sign Up forms.
 * Phone validation lives separately in `lib/phone.ts`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A pragmatic email check — good enough to catch typos without rejecting real addresses. */
export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim());
}

/** Names just need to be non-trivial; farmers may enter Devanagari or Latin script. */
export function isValidName(input: string): boolean {
  return input.trim().length >= 2;
}

/** Floor for a new password: 8+ characters with at least one letter and one number. */
export function isValidPassword(input: string): boolean {
  return input.length >= 8 && /[A-Za-z]/.test(input) && /\d/.test(input);
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** A light-touch strength estimate for the meter on the Sign Up form — not a policy gate. */
export function passwordStrength(input: string): PasswordStrength {
  let score = 0;
  if (input.length >= 8) score += 1;
  if (input.length >= 12) score += 1;
  if (/[a-z]/.test(input) && /[A-Z]/.test(input)) score += 1;
  if (/\d/.test(input)) score += 1;
  if (/[^A-Za-z0-9]/.test(input)) score += 1;

  if (score <= 2) return 'weak';
  if (score <= 3) return 'fair';
  return 'strong';
}
