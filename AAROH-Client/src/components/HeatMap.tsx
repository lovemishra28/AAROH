import { useMemo, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import {
  extentOf,
  idwAt,
  normalise,
  padExtent,
  pointInRing,
  rangeOf,
  toLocalMetres,
  type LatLng,
  type MetrePoint,
  type Sample,
} from '@/lib/geo';
import { colors, radii } from '@/theme/tokens';

import { Text } from './Text';

/**
 * Field heat map, drawn with plain `View`s.
 *
 * There is no SVG, no Canvas and no map SDK here, and that is a decision rather than a
 * limitation. The app ships to phones that may never have a data connection in the
 * field, so a tile-based map would render as a grey rectangle exactly where it is
 * needed; and adding a native drawing dependency would cost a rebuild of the dev
 * client for a picture we can produce with absolutely positioned squares.
 *
 * What it shows: soil measurements are taken at a few dozen points, so the surface
 * between them is interpolated (inverse distance weighting, `lib/geo`) onto a grid of
 * coloured cells, then clipped to the field's boundary so no colour is ever painted
 * over land that was not measured. The measured points sit on top as dots — tapping
 * one gives its actual value, because an interpolated surface is a suggestion and the
 * probe reading is a fact.
 *
 * The ramp is single-hue, pale to deep green, meaning *less* to *more* of whatever
 * metric is selected. A red-to-green ramp was the obvious choice and is wrong: it
 * reads as bad-to-good, which holds for nitrogen and inverts for salinity.
 */

export type HeatPoint = {
  id: string;
  lat: number;
  lng: number;
  /** Value in storage units; formatting is the caller's business. */
  value: number;
  /** Optional secondary line for the callout, e.g. the time it was taken. */
  caption?: string;
};

type HeatMapProps = {
  points: readonly HeatPoint[];
  /** Field boundary as a lat/lng ring. Without it the grid fills the sampled extent. */
  boundary?: readonly LatLng[];
  height?: number;
  /** Renders a value for the callout and the legend ends. */
  format: (value: number) => string;
  /** Shown under the map — the metric name and unit. */
  caption?: string;
  emptyLabel: string;
};

/** Target cell edge in px. Small enough to read as a gradient, large enough to stay cheap. */
const TARGET_CELL_PX = 13;

/** Hard ceiling on cell count. ~700 Views renders smoothly; thousands do not. */
const MAX_CELLS = 720;

/** Orange → green, meaning "deficiency → abundance". Accent 500 / Accent 200 / Brand 200 / Brand 600. */
const RAMP = ['#FE7F02', '#FFD0A3', '#C7E0B9', '#1F5A2A'] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RAMP_RGB = RAMP.map(hexToRgb);

/** Colour for a 0–1 position on the ramp, interpolated between the nearest two stops. */
function rampColor(t: number): string {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (RAMP_RGB.length - 1);
  const i = Math.min(Math.floor(scaled), RAMP_RGB.length - 2);
  const f = scaled - i;
  const a = RAMP_RGB[i];
  const b = RAMP_RGB[i + 1];
  const mix = (x: number, y: number) => Math.round(x + (y - x) * f);
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
}

type Cell = { left: number; top: number; size: number; color: string };

type Plot = {
  cells: Cell[];
  dots: { point: HeatPoint; left: number; top: number }[];
  boundaryPx?: { left: number; top: number }[];
  min: number;
  max: number;
};

function getDenseBoundary(ringPx: { left: number; top: number }[], step: number) {
  const points: { left: number; top: number }[] = [];
  if (ringPx.length < 3) return points;
  
  for (let i = 0; i < ringPx.length; i++) {
    const p1 = ringPx[i];
    const p2 = ringPx[(i + 1) % ringPx.length];
    
    const dx = p2.left - p1.left;
    const dy = p2.top - p1.top;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let j = 0; j < steps; j++) {
      points.push({
        left: p1.left + (dx * j) / steps,
        top: p1.top + (dy * j) / steps,
      });
    }
  }
  return points;
}

/**
 * Turns coordinates into pixels, once, for a known box size.
 *
 * Kept as one pure function rather than several `useMemo`s because every step depends
 * on the projection: the origin fixes the metre frame, the extent fixes the scale, and
 * the scale fixes which cells exist. Splitting it would mean recomputing the projection
 * three times and risking three slightly different answers.
 */
function buildPlot(
  points: readonly HeatPoint[],
  boundary: readonly LatLng[] | undefined,
  width: number,
  height: number,
): Plot | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;

  const range = rangeOf(points.map((p) => p.value));
  if (!range) return null;

  // Any point will do as the metre-frame origin; the first keeps it deterministic.
  const origin: LatLng = { lat: points[0].lat, lng: points[0].lng };
  const samples: Sample[] = points.map((p) => {
    const m = toLocalMetres(p, origin);
    return { x: m.x, y: m.y, value: p.value };
  });
  const ring: MetrePoint[] = (boundary ?? []).map((p) => toLocalMetres(p, origin));

  const extent = padExtent(extentOf([...samples, ...ring]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const spanX = extent.maxX - extent.minX;
  const spanY = extent.maxY - extent.minY;
  if (!(spanX > 0) || !(spanY > 0)) return null;

  // One scale for both axes so a square plot draws square. Whatever is left over
  // becomes margin, centred, rather than stretching the land to fill the card.
  const scale = Math.min(width / spanX, height / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  // Metres → px. Screen y grows downward while north grows up, hence the flip.
  const toPx = (m: MetrePoint) => ({
    left: offsetX + (m.x - extent.minX) * scale,
    top: offsetY + (extent.maxY - m.y) * scale,
  });

  let cols = Math.max(1, Math.round(drawnW / TARGET_CELL_PX));
  let rows = Math.max(1, Math.round(drawnH / TARGET_CELL_PX));
  // Coarsen both axes together if the grid would be too large, so cells stay square.
  while (cols * rows > MAX_CELLS && cols > 1 && rows > 1) {
    cols = Math.max(1, Math.floor(cols * 0.85));
    rows = Math.max(1, Math.floor(rows * 0.85));
  }

  const cellW = drawnW / cols;
  const cellH = drawnH / rows;
  const hasRing = ring.length >= 3;
  const cells: Cell[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // Cell centre in metres, so the colour belongs to the middle of the square
      // rather than its corner — a half-cell shift is visible at this resolution.
      const centre: MetrePoint = {
        x: extent.minX + ((c + 0.5) / cols) * spanX,
        y: extent.maxY - ((r + 0.5) / rows) * spanY,
      };
      if (hasRing && !pointInRing(centre, ring)) continue;

      const value = idwAt(centre, samples);
      if (value === null) continue;

      cells.push({
        left: offsetX + c * cellW,
        top: offsetY + r * cellH,
        // +1 closes the hairline seams that appear once these land on device pixels.
        size: Math.ceil(Math.max(cellW, cellH)) + 1,
        color: rampColor(normalise(value, range)),
      });
    }
  }

  return {
    cells,
    dots: points.map((p) => {
      const { left, top } = toPx(toLocalMetres(p, origin));
      return { point: p, left, top };
    }),
    boundaryPx: hasRing ? getDenseBoundary(ring.map(toPx), 2) : undefined,
    min: range.min,
    max: range.max,
  };
}

const DOT = 12;

export function HeatMap({
  points,
  boundary,
  height = 220,
  format,
  caption,
  emptyLabel,
}: HeatMapProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const plot = useMemo(
    () => buildPlot(points, boundary, width, height),
    [points, boundary, width, height],
  );

  const chosen = plot?.dots.find((d) => d.point.id === selected) ?? null;

  return (
    <View>
      <View
        onLayout={onLayout}
        className="overflow-hidden rounded-card bg-surface-sunken"
        style={{ height }}
      >
        {plot === null ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-sm text-ink-muted">{emptyLabel}</Text>
          </View>
        ) : (
          <>
            {/* Interpolated surface. Not interactive: the dots below are the facts. */}
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
            >
              {plot.cells.map((cell, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: Math.floor(cell.left),
                    top: Math.floor(cell.top),
                    width: cell.size,
                    height: cell.size,
                    backgroundColor: cell.color,
                  }}
                />
              ))}
            </View>

            {plot.boundaryPx && plot.boundaryPx.length >= 3 ? (
              <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
                {plot.boundaryPx.map((p, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: p.left - 2,
                      top: p.top - 2,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: colors.ink.default,
                    }}
                  />
                ))}
              </View>
            ) : null}

            {plot.dots.map(({ point, left, top }) => {
              const isSelected = point.id === selected;
              return (
                <Pressable
                  key={point.id}
                  accessibilityRole="button"
                  accessibilityLabel={format(point.value)}
                  hitSlop={10}
                  onPress={() => setSelected(isSelected ? null : point.id)}
                  style={{
                    position: 'absolute',
                    left: left - DOT / 2,
                    top: top - DOT / 2,
                    width: DOT,
                    height: DOT,
                    borderRadius: radii.pill,
                    borderWidth: isSelected ? 3 : 1.5,
                    borderColor: isSelected ? colors.accent[500] : colors.white,
                    backgroundColor: isSelected ? colors.white : 'rgba(26,26,26,0.35)',
                  }}
                />
              );
            })}

            {chosen ? (
              <View
                className="absolute left-2 top-2 rounded-field bg-surface px-2.5 py-1.5"
                style={{ borderWidth: 1, borderColor: colors.line.default, maxWidth: '70%' }}
              >
                <Text weight="semibold" className="text-sm text-ink">
                  {format(chosen.point.value)}
                </Text>
                {chosen.point.caption ? (
                  <Text className="text-xs text-ink-muted">{chosen.point.caption}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>

      {plot !== null ? (
        <View className="mt-2 flex-row items-center">
          <Text className="mr-2 text-xs text-ink-muted">{format(plot.min)}</Text>
          <View className="h-2 flex-1 flex-row overflow-hidden rounded-pill">
            {Array.from({ length: 24 }, (_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: rampColor(i / 23) }} />
            ))}
          </View>
          <Text className="ml-2 text-xs text-ink-muted">{format(plot.max)}</Text>
        </View>
      ) : null}
    </View>
  );
}
