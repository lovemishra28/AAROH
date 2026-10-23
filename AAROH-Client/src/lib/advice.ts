/**
 * Maps the server's stable rationale/warning *tokens* to localized phrases.
 *
 * The server never sends display prose we should trust for the UI — it sends codes
 * (`LEGUME_FIXES_N`, `N_ADD_UREA+P_ADD_DAP`) and advisory tokens
 * (`acidic_soil_ph_5.2: …`). We translate the token; we never render the raw English
 * that trails a warning's colon, except as a last-resort fallback for an unknown token.
 *
 * Token sources (aaroh-server/ai/src/.../agronomy/engine.py):
 *   Segment A rationale : LEGUME_FIXES_N | SOIL_SUFFICIENT
 *   Segment B rationale : "+"-joined of N_ADD_UREA | P_ADD_DAP | K_ADD_MOP, or SOIL_SUFFICIENT
 *   Warnings            : npk_proxy_uncalibrated | agronomy_config_provisional
 *                         | acidic_soil_ph_<ph> | alkaline_soil_ph_<ph> | unexpected season …
 */

/** i18n keys (under `advice.rationale.*`) for a possibly compound rationale code. */
export function rationaleKeys(code: string | null | undefined): string[] {
  if (!code) return [];
  return code
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `advice.rationale.${part}`);
}

export type ParsedWarning =
  | { key: string; params?: Record<string, string | number> }
  | { text: string };

/**
 * Turn one raw warning string into something renderable. Known tokens map to an i18n key
 * (with the pH value extracted as a param); an unknown token falls back to the human
 * sentence after its colon so we never crash on a warning the server adds later.
 */
export function parseWarning(raw: string): ParsedWarning {
  const token = raw.split(':', 1)[0]?.trim() ?? raw;

  if (token.startsWith('npk_proxy_uncalibrated')) return { key: 'advice.warn.npkUncalibrated' };
  if (token.startsWith('agronomy_config_provisional')) return { key: 'advice.warn.provisional' };

  if (token.startsWith('acidic_soil_ph')) {
    return { key: 'advice.warn.acidic', params: { ph: token.replace('acidic_soil_ph_', '') } };
  }
  if (token.startsWith('alkaline_soil_ph')) {
    return { key: 'advice.warn.alkaline', params: { ph: token.replace('alkaline_soil_ph_', '') } };
  }
  if (token.toLowerCase().startsWith('unexpected season')) return { key: 'advice.warn.season' };

  // Unknown token: show the trailing human sentence if there is one, else the whole string.
  const idx = raw.indexOf(':');
  return { text: idx >= 0 ? raw.slice(idx + 1).trim() : raw };
}
