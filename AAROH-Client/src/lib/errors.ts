import { ApiError, NetworkError } from '@/api/client';

import { columnLabelKey } from './soil';

/**
 * Turns any thrown error into a localized, farmer-facing message. The server sends
 * English prose we deliberately ignore — we branch on the stable `error.code` and render
 * a Hindi/English string of our own, per the guide's "never show the raw English" rule.
 *
 * `t` is passed in (rather than imported) so this stays a pure function usable from any
 * screen without coupling to a specific i18n instance.
 */

type TParams = Record<string, unknown>;
type TFunc = (key: string, params?: TParams) => string;

/** The request never reached the server — treat as offline/connectivity. */
export function isOfflineError(err: unknown): boolean {
  return err instanceof NetworkError;
}

/** The AI advisor was unreachable/slow/erroring — a "try again" state, not a data error. */
export function isAiError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'AI_UNREACHABLE' || err.code === 'AI_TIMEOUT' || err.code === 'AI_SERVICE_ERROR')
  );
}

/** True when the field genuinely can't produce advice yet (needs a reading / area). */
export function isNeedsSetupError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'NO_READING' ||
      err.code === 'AREA_REQUIRED' ||
      err.code === 'READING_INCOMPLETE')
  );
}

export function describeError(err: unknown, t: TFunc): string {
  if (isOfflineError(err)) return t('errors.network');

  if (err instanceof ApiError) {
    switch (err.code) {
      case 'READING_INCOMPLETE': {
        const missing = extractMissing(err.details);
        const fields = missing.map((c) => t(columnLabelKey(c) ?? c)).join(', ');
        return fields
          ? t('errors.readingIncompleteWith', { fields })
          : t('errors.readingIncomplete');
      }
      case 'NO_READING':
        return t('errors.noReading');
      case 'AREA_REQUIRED':
        return t('errors.areaRequired');
      case 'AI_UNREACHABLE':
      case 'AI_TIMEOUT':
      case 'AI_SERVICE_ERROR':
        return t('errors.aiUnreachable');
      case 'FIELD_NOT_FOUND':
      case 'READING_NOT_FOUND':
      case 'NOT_FOUND':
        return t('errors.notFound');
      case 'VALIDATION_ERROR':
        return t('errors.validation');
      case 'RATE_LIMIT':
        return t('errors.rateLimit');
      default:
        return t('errors.generic');
    }
  }

  return t('errors.generic');
}

/** Pull `details.missing: string[]` out of a READING_INCOMPLETE envelope, defensively. */
function extractMissing(details: unknown): string[] {
  if (details && typeof details === 'object' && 'missing' in details) {
    const m = (details as { missing?: unknown }).missing;
    if (Array.isArray(m)) return m.filter((x): x is string => typeof x === 'string');
  }
  return [];
}
