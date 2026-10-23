import type { GeoJsonPoint, GeoJsonPolygon } from '@/api/types';

/**
 * Geometry for the field heat map.
 *
 * Everything here is pure and dependency-free — no React, no map SDK, no
 * `react-native-svg`. That is deliberate: the heat map is drawn with plain `View`s
 * (see `components/HeatMap.tsx`), so the only thing standing between server GeoJSON
 * and a coloured cell is this file, and it can be checked by a plain Node script.
 *
 * Two conventions worth stating once, because getting either wrong is silent:
 *
 *  - **GeoJSON is [longitude, latitude].** Every screen says "lat, lng"; PostGIS says
 *    the opposite. `pointFromGeoJson` is the only place that unpacks the array.
 *  - **Work in metres, not degrees.** A degree of longitude at 26°N is ~100 km while a
 *    degree of latitude is ~111 km, so interpolating or drawing in raw degrees would
 *    stretch every field east–west by 11%. `toLocalMetres` flattens a small area onto
 *    a plane first; at field scale (hundreds of metres) the error is centimetres.
 */

export type LatLng = { lat: number; lng: number };

/** A point in a local planar frame: metres east and north of an origin. */
export type MetrePoint = { x: number; y: number };

/** Metres per degree of latitude. Constant enough anywhere on earth for our scale. */
const M_PER_DEG_LAT = 111_320;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** GeoJSON Point → `{lat, lng}`, or null for anything malformed. */
export function pointFromGeoJson(point: GeoJsonPoint | null | undefined): LatLng | null {
  const c = point?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lng, lat] = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * The outer ring of a polygon, with the repeated closing vertex dropped.
 *
 * GeoJSON closes rings by repeating the first point; both ray casting and drawing
 * want the open form, and a duplicated vertex adds a zero-length edge that some
 * algorithms count twice.
 */
export function ringFromGeoJson(polygon: GeoJsonPolygon | null | undefined): LatLng[] {
  const ring = polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return [];

  const points: LatLng[] = [];
  for (const pair of ring) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [lng, lat] = pair;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({ lat, lng });
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first && last && first.lat === last.lat && first.lng === last.lng) {
    points.pop();
  }
  return points;
}

/**
 * Projects to metres east/north of `origin` (equirectangular). Valid for the few
 * hundred metres a field spans; not a general-purpose projection.
 */
export function toLocalMetres(point: LatLng, origin: LatLng): MetrePoint {
  return {
    x: (point.lng - origin.lng) * M_PER_DEG_LAT * Math.cos(toRad(origin.lat)),
    y: (point.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/** Great-circle distance in metres. Used for "which field is nearest" style checks. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type Extent = { minX: number; minY: number; maxX: number; maxY: number };

/** Axis-aligned extent of a set of planar points. Null for an empty set. */
export function extentOf(points: MetrePoint[]): Extent | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Grows an extent so nothing sits on the edge of the drawing, and so a degenerate
 * extent still has an area.
 *
 * The floor matters more than the padding: a farmer who probed the same spot six
 * times produces an extent of zero width, and dividing by that width to place a cell
 * yields NaN — a blank map with no error anywhere.
 */
export function padExtent(extent: Extent, ratio = 0.12, minSpanM = 20): Extent {
  const width = extent.maxX - extent.minX;
  const height = extent.maxY - extent.minY;
  const padX = Math.max(width * ratio, (minSpanM - width) / 2, 0);
  const padY = Math.max(height * ratio, (minSpanM - height) / 2, 0);
  return {
    minX: extent.minX - padX,
    minY: extent.minY - padY,
    maxX: extent.maxX + padX,
    maxY: extent.maxY + padY,
  };
}

/**
 * Ray casting: is the planar point inside the ring?
 *
 * This is the boundary mask. Without it the interpolated grid is a rectangle, which
 * would show the farmer soil colour over the neighbour's plot and the track between
 * them. Points exactly on an edge may fall either way; at half-metre cell resolution
 * that is not a distinction anyone can see.
 */
export function pointInRing(point: MetrePoint, ring: MetrePoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const t = (point.y - a.y) / (b.y - a.y);
    if (point.x < a.x + t * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

export type Sample = MetrePoint & { value: number };

/**
 * Inverse-distance weighting: the value at `target`, weighted by 1/d² of every sample.
 *
 * Chosen over kriging or a spline for one reason — it is honest about what it is. IDW
 * never invents a value outside the measured range, so a field whose probes read
 * 90–140 mg/kg can never render a patch that implies 300. A smoother interpolator
 * would look better and lie.
 *
 * `smoothingM` keeps the weight finite at a sample's own position (otherwise the
 * nearest cell divides by zero) and doubles as a resolution limit: two probes 2 m
 * apart cannot produce a sharp edge between them, because the phone's GPS cannot tell
 * you which side of that edge you are standing on.
 */
export function idwAt(target: MetrePoint, samples: Sample[], smoothingM = 3, power = 2): number | null {
  if (samples.length === 0) return null;

  let weighted = 0;
  let weights = 0;
  for (const s of samples) {
    const dx = s.x - target.x;
    const dy = s.y - target.y;
    const d2 = dx * dx + dy * dy + smoothingM * smoothingM;
    const w = 1 / d2 ** (power / 2);
    weighted += w * s.value;
    weights += w;
  }
  return weights > 0 ? weighted / weights : null;
}

export type Range = { min: number; max: number };

/** Min and max of the sample values, or null when there is nothing to scale against. */
export function rangeOf(values: number[]): Range | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

/**
 * Where `value` sits in the range, 0–1. A flat range returns 0.5 rather than 0 or 1:
 * a field measuring exactly 120 mg/kg everywhere is uniformly average, not uniformly
 * deficient, and colouring it the "low" end would invent a problem.
 */
export function normalise(value: number, range: Range): number {
  const span = range.max - range.min;
  if (!(span > 0)) return 0.5;
  const t = (value - range.min) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
