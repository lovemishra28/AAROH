import type { Field, FieldAggregate, Reading } from '@/api/types';
import { formatNumber } from '@/lib/format';
import { SOIL_FIELDS, type SoilFieldDef } from '@/lib/soil';
import { hectaresToAcres, microSiemensToDsm } from '@/lib/units';

/**
 * Field naming and metric plumbing, shared by every surface that shows a field.
 *
 * Two problems live here. The first is that an **auto-detected field has no name** —
 * the server refuses to invent one, because it would have to invent it in one
 * language and the app renders in two. So the label is the app's job, and it must be
 * the *same* label everywhere: a plot the dashboard calls "Field 2" cannot be
 * "Detected field" when it is opened. `fieldLabels` derives the numbering from the
 * farmer's full field list in creation order, so every screen that has that list
 * (all of them — it is one cached query) agrees.
 *
 * The second is that a metric's storage unit and its display unit differ for EC:
 * stored µS/cm, read as dS/m. Putting that conversion in the metric table means the
 * heat map, the legend and the metric chips cannot disagree about it.
 */

export type MetricId = 'n' | 'p' | 'k' | 'ph' | 'ec' | 'moisture' | 'temp';

export type MetricDef = {
  id: MetricId;
  /** The reading/aggregate property this metric reads. */
  col: SoilFieldDef['col'];
  /** Short chip label, e.g. "N". Symbols, not words — chips are ~32 px wide. */
  short: string;
  labelKey: string;
  /** Unit as displayed, which is not always the unit stored (see EC). */
  unit: string;
  decimals: number;
  icon: SoilFieldDef['icon'];
  /** Storage value → display value. Identity for everything except EC. */
  toDisplay: (value: number) => number;
};

const identity = (v: number): number => v;

/**
 * Label, unit, decimals and icon come from `SOIL_FIELDS` rather than being restated
 * here, so a metric cannot be called "Salinity (EC)" in the manual form and something
 * else on the map. Only what the map genuinely adds — the chip symbol and the
 * storage→display conversion — is defined below.
 */
function soilField(col: SoilFieldDef['col']): SoilFieldDef {
  const found = SOIL_FIELDS.find((f) => f.col === col);
  // Unreachable unless SOIL_FIELDS drops a column that is still in the type union.
  // Failing loudly at import beats rendering a map with a blank axis.
  if (!found) throw new Error(`fields.ts: no soil field defined for column "${col}"`);
  return found;
}

function metric(
  id: MetricId,
  col: SoilFieldDef['col'],
  short: string,
  toDisplay: (value: number) => number = identity,
): MetricDef {
  const soil = soilField(col);
  return {
    id,
    col,
    short,
    labelKey: soil.labelKey,
    unit: soil.unit,
    decimals: soil.decimals,
    icon: soil.icon,
    toDisplay,
  };
}

/**
 * The metrics a heat map can show, in the order the chips appear. NPK lead because
 * they are what a fertiliser decision turns on; temperature is last because it is the
 * one value that says more about the hour than the soil.
 */
export const HEAT_METRICS: readonly MetricDef[] = [
  metric('n', 'n_mgkg', 'N'),
  metric('p', 'p_mgkg', 'P'),
  metric('k', 'k_mgkg', 'K'),
  metric('ph', 'ph', 'pH'),
  // Stored µS/cm, read in dS/m — the one metric whose two units differ.
  metric('ec', 'ec_uscm', 'EC', microSiemensToDsm),
  metric('moisture', 'moisture_vwc', '%'),
  metric('temp', 'soil_temp_c', 'T'),
];

export function metricById(id: MetricId): MetricDef {
  return HEAT_METRICS.find((m) => m.id === id) ?? HEAT_METRICS[0];
}

/** A reading's value for a metric, in **storage** units. Null when unmeasured. */
export function readingMetric(reading: Reading, metric: MetricDef): number | null {
  const raw = reading[metric.col];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** A field mean for a metric, in **storage** units. Null when the field has no readings. */
export function aggregateMetric(
  aggregate: FieldAggregate | null | undefined,
  metric: MetricDef,
): number | null {
  if (!aggregate) return null;
  const raw = aggregate[metric.col];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** Storage value → display string, with the metric's own unit and precision. */
export function formatMetric(value: number | null, metric: MetricDef): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return formatNumber(metric.toDisplay(value), metric.decimals);
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * A display label for every field, keyed by id.
 *
 * Named fields keep their name. Auto-detected ones are numbered in the order they were
 * detected — "Field 1", "Field 2" — because that is the order the farmer walked them,
 * and a number they can count along their own land beats a coordinate they cannot.
 *
 * Pass the farmer's whole list. Passing a subset renumbers, which is exactly the
 * inconsistency this function exists to prevent.
 */
export function fieldLabels(fields: readonly Field[], t: Translate): Map<string, string> {
  const byAge = [...fields].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const labels = new Map<string, string>();
  let detected = 0;
  for (const field of byAge) {
    if (field.name && field.name.trim().length > 0) {
      labels.set(field.id, field.name.trim());
      continue;
    }
    detected += 1;
    labels.set(field.id, t('fields.autoLabel', { index: detected }));
  }
  return labels;
}

/**
 * The label for one field. `labels` comes from {@link fieldLabels}; without it an
 * unnamed field falls back to the generic word, which is correct but unnumbered — so
 * always pass the map when the list is to hand.
 */
export function fieldLabel(
  field: Pick<Field, 'id' | 'name'>,
  t: Translate,
  labels?: Map<string, string>,
): string {
  const named = field.name?.trim();
  if (named) return named;
  return labels?.get(field.id) ?? t('fields.autoLabelGeneric');
}

/** Area in the unit the farmer thinks in (acres), or the "not set" phrase. */
export function areaLabel(field: Pick<Field, 'area_ha'>, t: Translate): string {
  if (field.area_ha == null || !Number.isFinite(field.area_ha)) return t('fields.noArea');
  return `${formatNumber(hectaresToAcres(field.area_ha), 2)} ${t('fieldCreate.areaUnit')}`;
}

/** Newest field first, by detection or creation time. The switcher's order. */
export function sortFieldsNewestFirst(fields: readonly Field[]): Field[] {
  return [...fields].sort((a, b) => {
    const aAt = a.detected_at ?? a.created_at;
    const bAt = b.detected_at ?? b.created_at;
    return bAt.localeCompare(aAt);
  });
}
