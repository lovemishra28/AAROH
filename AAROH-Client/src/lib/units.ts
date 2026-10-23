/**
 * Unit conversions.
 *
 * This file exists because the Aaroh API is strict about units and the farmer is not.
 * Every value the app sends to the server must already be in the unit named by the
 * field's suffix. Two conversions matter for the manual-input flow:
 *
 *   area:  the farmer thinks in **acres**; the API wants `area_ha` in **hectares**.
 *   EC:    meters and agronomists quote **dS/m**; the API wants `ec_uscm` in **µS/cm**.
 *
 * Nutrients are NOT converted. N/P/K entered by hand are elemental mg/kg — the same
 * unit the probe reports — and go straight into `n_mgkg` / `p_mgkg` / `k_mgkg`. The
 * server's agronomy engine is the only thing that converts elemental P/K to the P2O5 /
 * K2O oxide basis. Never do that maths here.
 */

/** 1 hectare = 2.4710538147 acres (exact-enough survey conversion). */
export const ACRES_PER_HECTARE = 2.4710538147;

/** 1 acre = 0.40468564224 hectares (exact by definition of the international acre). */
export const HECTARES_PER_ACRE = 0.40468564224;

export function acresToHectares(acres: number): number {
  return acres * HECTARES_PER_ACRE;
}

export function hectaresToAcres(hectares: number): number {
  return hectares * ACRES_PER_HECTARE;
}

/** Electrical conductivity: 1 dS/m = 1000 µS/cm. */
export function dsmToMicroSiemens(dsm: number): number {
  return dsm * 1000;
}

export function microSiemensToDsm(uscm: number): number {
  return uscm / 1000;
}

/**
 * Plausible EC window for the soils this model was trained on, expressed in dS/m.
 * The training set spans roughly 30–7263 µS/cm, so anything outside this range is
 * either a unit mix-up or an extraordinary soil. Warn, do not block — a farmer with a
 * genuinely saline patch still deserves an answer.
 */
export const EC_PLAUSIBLE_DSM = { min: 0.03, max: 7.3 } as const;

export function isEcPlausible(dsm: number): boolean {
  return dsm >= EC_PLAUSIBLE_DSM.min && dsm <= EC_PLAUSIBLE_DSM.max;
}

/** Rounds for display without pretending to more precision than we have. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
