import { Ionicons } from '@expo/vector-icons';

import { EC_PLAUSIBLE_DSM } from './units';

/**
 * The manual soil-reading fields — the single source of truth shared by the M5 form and
 * the error-mapping layer, so field labels, units and ranges never drift between where a
 * value is entered and where a "missing field" error is explained.
 *
 * Units carry their name. `ec` is entered in **dS/m** (what lab reports and Soil Health
 * Cards use) but the server column is **`ec_uscm`** — the form multiplies ×1000 on submit
 * (lib/units). NPK are elemental mg/kg (probe basis), sent verbatim. `soil_temp_c` is the
 * only optional field; the other six are required or the recommendation returns 422.
 */

type IoniconName = keyof typeof Ionicons.glyphMap;

export type SoilFieldId = 'n' | 'p' | 'k' | 'ph' | 'ec' | 'moisture' | 'soilTemp';

export type SoilFieldDef = {
  id: SoilFieldId;
  /** Server column the value ultimately lands in. */
  col: 'n_mgkg' | 'p_mgkg' | 'k_mgkg' | 'ph' | 'ec_uscm' | 'moisture_vwc' | 'soil_temp_c';
  /** i18n key under `reading.fields.*` for the label. */
  labelKey: string;
  hintKey: string;
  /** Display unit, in the unit the farmer *enters* (EC in dS/m, not µS/cm). */
  unit: string;
  icon: IoniconName;
  /** Hard validation bounds, in the entered unit. Outside → blocked. */
  min: number;
  max: number;
  /** Golden-sample value for fast demoing (entered unit). */
  sample: number;
  /** Input precision hint (decimals). */
  decimals: number;
  required: boolean;
};

export const SOIL_FIELDS: readonly SoilFieldDef[] = [
  { id: 'n', col: 'n_mgkg', labelKey: 'reading.fields.n', hintKey: 'reading.hints.n', unit: 'mg/kg', icon: 'leaf-outline', min: 0, max: 1000, sample: 100, decimals: 0, required: true },
  { id: 'p', col: 'p_mgkg', labelKey: 'reading.fields.p', hintKey: 'reading.hints.p', unit: 'mg/kg', icon: 'flask-outline', min: 0, max: 500, sample: 8, decimals: 0, required: true },
  { id: 'k', col: 'k_mgkg', labelKey: 'reading.fields.k', hintKey: 'reading.hints.k', unit: 'mg/kg', icon: 'nutrition-outline', min: 0, max: 2000, sample: 90, decimals: 0, required: true },
  { id: 'ph', col: 'ph', labelKey: 'reading.fields.ph', hintKey: 'reading.hints.ph', unit: '', icon: 'water-outline', min: 3, max: 10, sample: 7.2, decimals: 1, required: true },
  { id: 'ec', col: 'ec_uscm', labelKey: 'reading.fields.ec', hintKey: 'reading.hints.ec', unit: 'dS/m', icon: 'flash-outline', min: 0, max: 20, sample: 0.3, decimals: 2, required: true },
  { id: 'moisture', col: 'moisture_vwc', labelKey: 'reading.fields.moisture', hintKey: 'reading.hints.moisture', unit: '%', icon: 'rainy-outline', min: 0, max: 100, sample: 20, decimals: 0, required: true },
  { id: 'soilTemp', col: 'soil_temp_c', labelKey: 'reading.fields.soilTemp', hintKey: 'reading.hints.soilTemp', unit: '°C', icon: 'thermometer-outline', min: -10, max: 60, sample: 24, decimals: 0, required: false },
];

/** True if a dS/m EC value sits inside the model's training window (soft-warn otherwise). */
export function isEcInRange(dsm: number): boolean {
  return dsm >= EC_PLAUSIBLE_DSM.min && dsm <= EC_PLAUSIBLE_DSM.max;
}

const COL_TO_LABEL: Record<string, string> = Object.fromEntries(
  SOIL_FIELDS.map((f) => [f.col, f.labelKey]),
);

/** i18n label key for a server column name (used to explain READING_INCOMPLETE). */
export function columnLabelKey(col: string): string | undefined {
  return COL_TO_LABEL[col];
}
