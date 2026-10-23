/**
 * Generates the three-field mock survey — the dataset that proves Workstream 2 end to end.
 *
 *   node scripts/make-mock-walk.mjs
 *
 * There is no physical stick yet, so the whole pipeline (BLE → scan log → sync → clustering
 * → fields → heat map) has to be exercised with frames a second phone sends by hand. That
 * makes the *geometry* of the mock data load-bearing: the server clusters with DBSCAN at
 * eps 40 m / minPoints 3 and attaches a point to an existing field within 120 m, so a walk
 * whose points are 60 m apart yields no field at all, and two "separate" plots 80 m apart
 * yield one. Hand-typed coordinates get that wrong silently — hence a generator that lays
 * out a real serpentine walk on a metre grid and then *asserts* the clustering invariants
 * before writing anything.
 *
 * Three outputs, one source of truth (the FIELDS table below):
 *
 *   test-frames/10-survey-3-fields.txt          90 frames, one per line — the canonical file
 *   test-frames/11-survey-3-fields-packed.txt   the same 90, three per notification
 *   src/dev/mockFrames.ts                       the same 90, for the in-app dev loader
 *
 * The packed file exists because sending 90 notifications by thumb is a poor use of an
 * afternoon: the app's frame splitter cuts on every `ID:`, so several frames in one value
 * are decoded as several readings (see BleService.splitOnFrameStarts). Three per line keeps
 * each notification under the 512-byte MTU ceiling.
 *
 * Re-running is safe and reproducible: the PRNG is seeded, so the same 90 frames come out
 * every time and a regenerated file shows an empty diff.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fixed seed: the dataset is a fixture, and a fixture that changes per run is not one. */
const SEED = 20260829;

/** Mirrors api/src/modules/segregation config — if that changes, these assertions must too. */
const EPS_M = 40;
const MIN_POINTS = 3;
const FIELD_MATCH_M = 120;

const PROBE_ID = 'P-A1';
const FIRMWARE = '1.0.2';
const MODEL = 'AP-S1';

/** Frames per line in the packed file. 3 × ~130 chars stays well inside a 512-byte MTU. */
const PACK_PER_LINE = 3;
/** The scan log keeps `MAX_RAW_FRAME_CHARS = 200` of each frame; longer would be truncated. */
const MAX_FRAME_CHARS = 200;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
/** Symmetric noise of ±`m`. */
const noise = (m) => (rand() * 2 - 1) * m;
const round = (v, dp) => Number(v.toFixed(dp));

const METRES_PER_DEG_LAT = 111_320;
const metresPerDegLng = (lat) => METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * The three plots.
 *
 * Anchors sit 0.8–1.3 km apart near Gwalior, and no closer than ~1.7 km to the older `02`/`03`
 * walks, so this file creates three *new* fields whatever else the account has synced before.
 *
 * Each plot has a genuine spatial gradient rather than random scatter, because the heat map
 * is the thing being demonstrated: noise looks like a broken sensor, a gradient looks like a
 * field. `u` runs west→east, `v` south→north, both 0…1 across the plot.
 */
const FIELDS = [
  {
    label: 'Plot 1 — canal side',
    note: 'Nitrogen-poor and slightly acidic; N and K rise towards the east, pH towards the north.',
    sid: 'S1-0829',
    lat: 26.2045,
    lng: 78.1612,
    cols: 6,
    rows: 5,
    spacing: 20,
    soil: (u, v) => ({
      n: 58 + 46 * u + noise(5),
      p: 7 + 6 * v + noise(1.1),
      k: 118 + 42 * u + noise(7),
      ph: 5.85 + 0.5 * v + noise(0.07),
      ec: 372 + 138 * u + noise(22),
      m: 13.5 + 5 * v + noise(0.9),
      t: 27.4 + noise(0.6),
    }),
  },
  {
    label: 'Plot 2 — well supplied loam',
    note: 'The healthy plot: everything sufficient, richest at the north end.',
    sid: 'S2-0829',
    lat: 26.2094,
    lng: 78.1678,
    cols: 5,
    rows: 6,
    spacing: 18,
    soil: (u, v) => ({
      n: 130 + 46 * v + noise(6),
      p: 25 + 12 * u + noise(1.6),
      k: 198 + 52 * v + noise(9),
      ph: 6.8 + 0.4 * u + noise(0.06),
      ec: 840 + 210 * v + noise(30),
      m: 22 + 5 * u + noise(1),
      t: 26.6 + noise(0.5),
    }),
  },
  {
    label: 'Plot 3 — low ground, saline',
    note: 'Alkaline and salt-affected, potassium-rich; the salinity climbs towards the far corner.',
    sid: 'S3-0829',
    lat: 26.1986,
    lng: 78.1724,
    cols: 6,
    rows: 5,
    spacing: 22,
    soil: (u, v) => {
      const d = (u + v) / 2;
      return {
        n: 94 + 34 * d + noise(5),
        p: 17 + 9 * (1 - d) + noise(1.3),
        k: 258 + 74 * d + noise(10),
        ph: 7.75 + 0.6 * d + noise(0.06),
        ec: 1880 + 720 * d + noise(45),
        m: 25 + 6 * (1 - d) + noise(1),
        t: 28.4 + noise(0.5),
      };
    },
  },
];

/** 2026-08-29, 07:30 IST — the walk starts early, as it would. */
let clock = Math.floor(Date.UTC(2026, 7, 29, 2, 0, 0) / 1000);

/**
 * Lays out one plot as a serpentine walk: along the first row west→east, up one row, back
 * east→west. That is how a person actually covers a field, and it keeps consecutive
 * timestamps adjacent in space — which is what makes the resulting scan log look real.
 */
function walk(field) {
  const points = [];
  const mPerLng = metresPerDegLng(field.lat);

  for (let row = 0; row < field.rows; row++) {
    for (let i = 0; i < field.cols; i++) {
      // Reverse every other row: the walker turns around at the edge rather than teleporting.
      const col = row % 2 === 0 ? i : field.cols - 1 - i;
      const u = field.cols === 1 ? 0.5 : col / (field.cols - 1);
      const v = field.rows === 1 ? 0.5 : row / (field.rows - 1);

      // ±3 m of wander: a farmer does not hit grid intersections, and the hull should not be
      // a suspiciously perfect rectangle.
      const east = col * field.spacing + noise(3);
      const north = row * field.spacing + noise(3);

      const soil = field.soil(u, v);
      // 85–110 s per point: probe in, wait for the reading to settle, walk to the next spot.
      clock += Math.round(85 + rand() * 25);

      points.push({
        field: field.label,
        sid: field.sid,
        east,
        north,
        lat: round(field.lat + north / METRES_PER_DEG_LAT, 5),
        lng: round(field.lng + east / mPerLng, 5),
        ts: clock,
        n: round(soil.n, 0),
        p: round(soil.p, 1),
        k: round(soil.k, 0),
        ph: round(soil.ph, 2),
        ec: round(soil.ec, 0),
        m: round(soil.m, 1),
        t: round(soil.t, 1),
      });
    }
  }
  // 25–40 minutes to pack up and reach the next plot.
  clock += Math.round(1500 + rand() * 900);
  return points;
}

const groups = FIELDS.map((field) => ({ field, points: walk(field) }));
const all = groups.flatMap((g) => g.points);

/**
 * Renders one frame.
 *
 * Fixed decimal places, not JavaScript's shortest representation: firmware prints with
 * `%.1f`/`%.5f`, so a real stick sends `M:14.0` and `Lat:26.20450`, never `M:14` and
 * `Lat:26.2045`. The difference is cosmetic to the parser and not to a person eyeballing
 * this file against a capture from the real device — and the point of the exercise is that
 * the two are indistinguishable.
 */
function frameOf(p) {
  return [
    `ID:${PROBE_ID}`,
    `FW:${FIRMWARE}`,
    `MDL:${MODEL}`,
    `SID:${p.sid}`,
    `N:${p.n.toFixed(0)}`,
    `P:${p.p.toFixed(1)}`,
    `K:${p.k.toFixed(0)}`,
    `pH:${p.ph.toFixed(2)}`,
    `EC:${p.ec.toFixed(0)}`,
    `M:${p.m.toFixed(1)}`,
    `T:${p.t.toFixed(1)}`,
    `Lat:${p.lat.toFixed(5)}`,
    `Lng:${p.lng.toFixed(5)}`,
    `TS:${p.ts}`,
  ].join(',');
}

/* ---------------------------------------------------------------- assertions */

/**
 * Distance between two points from their **stored** 5-decimal coordinates, not from the
 * metre grid they were laid out on. Rounding to 5 dp costs about a metre, and the whole
 * point of checking is to check what the server will actually receive.
 */
function distanceM(a, b) {
  const mPerLng = metresPerDegLng((a.lat + b.lat) / 2);
  const dx = (a.lng - b.lng) * mPerLng;
  const dy = (a.lat - b.lat) * METRES_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

const problems = [];

if (all.length < 50 || all.length > 100) {
  problems.push(`expected 50–100 readings, produced ${all.length}`);
}

// Every point must be a DBSCAN core point, or the cluster frays at the edges and the stray
// readings come back as "too far from any field" in the sync report.
for (const g of groups) {
  let worst = Infinity;
  for (const p of g.points) {
    const near = g.points.filter((q) => q !== p && distanceM(p, q) <= EPS_M).length;
    worst = Math.min(worst, near);
  }
  if (worst < MIN_POINTS) {
    problems.push(`${g.field.label}: a point has only ${worst} neighbours within ${EPS_M} m`);
  }
  g.minNeighbours = worst;
}

// And the plots must be unambiguously separate: further apart than the field-match radius,
// with a wide margin, or two of them merge into one field.
for (let i = 0; i < groups.length; i++) {
  for (let j = i + 1; j < groups.length; j++) {
    let closest = Infinity;
    for (const a of groups[i].points) {
      for (const b of groups[j].points) closest = Math.min(closest, distanceM(a, b));
    }
    if (closest < FIELD_MATCH_M * 2) {
      problems.push(
        `${groups[i].field.label} and ${groups[j].field.label} come within ${Math.round(closest)} m`,
      );
    }
    groups[i].separations = [...(groups[i].separations ?? []), Math.round(closest)];
  }
}

// The server's own validation, restated: anything it would reject must never reach the file.
for (const p of all) {
  if (p.n < 0 || p.p < 0 || p.k < 0) problems.push(`negative nutrient at TS ${p.ts}`);
  if (p.ph < 3 || p.ph > 10) problems.push(`pH ${p.ph} outside 3–10 at TS ${p.ts}`);
  if (p.m < 0 || p.m > 100) problems.push(`moisture ${p.m} outside 0–100 at TS ${p.ts}`);
  if (p.t < -20 || p.t > 80) problems.push(`temperature ${p.t} implausible at TS ${p.ts}`);
  if (p.ec < 0) problems.push(`negative EC at TS ${p.ts}`);
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) problems.push(`bad GPS at TS ${p.ts}`);
  const frame = frameOf(p);
  if (frame.length > MAX_FRAME_CHARS) {
    problems.push(`frame is ${frame.length} chars, over the ${MAX_FRAME_CHARS} kept per scan`);
  }
}

// Duplicate suppression keys on the exact frame text, so a repeated frame would silently
// vanish from the log rather than appear twice.
if (new Set(all.map(frameOf)).size !== all.length) problems.push('two frames are identical');

if (problems.length > 0) {
  console.error('Mock survey failed its own checks — nothing written:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- output */

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function summarise(g) {
  const p = g.points;
  const mPerLng = metresPerDegLng(g.field.lat);
  const spanX = (Math.max(...p.map((q) => q.lng)) - Math.min(...p.map((q) => q.lng))) * mPerLng;
  const spanY =
    (Math.max(...p.map((q) => q.lat)) - Math.min(...p.map((q) => q.lat))) * METRES_PER_DEG_LAT;
  const ha = (spanX * spanY) / 10_000;
  return {
    label: g.field.label,
    sid: g.field.sid,
    count: p.length,
    spanX: Math.round(spanX),
    spanY: Math.round(spanY),
    ha: ha.toFixed(2),
    acres: (ha * 2.47105).toFixed(2),
    n: Math.round(mean(p.map((q) => q.n))),
    p: mean(p.map((q) => q.p)).toFixed(1),
    k: Math.round(mean(p.map((q) => q.k))),
    ph: mean(p.map((q) => q.ph)).toFixed(2),
    ec: Math.round(mean(p.map((q) => q.ec))),
    dsm: (mean(p.map((q) => q.ec)) / 1000).toFixed(2),
    m: mean(p.map((q) => q.m)).toFixed(1),
    t: mean(p.map((q) => q.t)).toFixed(1),
    minNeighbours: g.minNeighbours,
  };
}

const summaries = groups.map(summarise);

const header = [
  '# Three-field survey — the Workstream 2 acceptance dataset. Every frame here is ACCEPTED.',
  '# Lines starting with # are notes — do not send them.',
  '#',
  `# Generated by scripts/make-mock-walk.mjs (seed ${SEED}). Do not hand-edit: regenerate.`,
  `# ${all.length} readings in ${groups.length} plots, laid out as serpentine walks on a metre grid.`,
  `# Clustering targets: eps ${EPS_M} m, minPoints ${MIN_POINTS}, field match ${FIELD_MATCH_M} m.`,
  '#',
  '# Expected result after one sync: 3 new fields, every reading assigned, none unassigned.',
  '#',
  ...summaries.map(
    (s) =>
      `#   ${s.sid}  ${s.count} pts  ${s.spanX}×${s.spanY} m (~${s.acres} ac)  ` +
      `N ${s.n} P ${s.p} K ${s.k} pH ${s.ph} EC ${s.dsm} dS/m  M ${s.m}% T ${s.t}°C`,
  ),
  '',
];

const lines = [...header];
for (const g of groups) {
  lines.push(`# ${g.field.label} (${g.field.sid}) — ${g.field.note}`);
  for (const p of g.points) lines.push(frameOf(p));
  lines.push('');
}

const canonical = join(ROOT, 'test-frames/10-survey-3-fields.txt');
writeFileSync(canonical, `${lines.join('\n')}`);

/* The packed variant: same frames, fewer thumb presses. */
const packedLines = [
  '# The same survey as 10-survey-3-fields.txt, three frames per notification, ACCEPTED.',
  '# Lines starting with # are notes — do not send them.',
  '#',
  '# The app splits a value on every `ID:` and flushes an unterminated frame after 400 ms of',
  '# silence, so one notification carrying three frames becomes three readings. Sending this',
  `# file is ${Math.ceil(all.length / PACK_PER_LINE)} sends instead of ${all.length}; the`,
  '# result in the app must be identical, which is the point of keeping both files.',
  '',
];
for (const g of groups) {
  packedLines.push(`# ${g.field.label} (${g.field.sid})`);
  for (let i = 0; i < g.points.length; i += PACK_PER_LINE) {
    packedLines.push(
      g.points
        .slice(i, i + PACK_PER_LINE)
        .map(frameOf)
        .join(''),
    );
  }
  packedLines.push('');
}
writeFileSync(join(ROOT, 'test-frames/11-survey-3-fields-packed.txt'), packedLines.join('\n'));

/* The in-app loader's copy. Generated from the same array, so the two cannot drift. */
const ts = [
  '/**',
  ' * GENERATED FILE — do not edit.',
  ' *',
  ' * Written by `scripts/make-mock-walk.mjs`, which also writes',
  ' * `test-frames/10-survey-3-fields.txt`. Both come from one array, so the frames a',
  ' * developer loads in-app are byte-identical to the ones a second phone would send.',
  ' *',
  ` * ${all.length} readings across ${groups.length} plots. Expected after one sync:`,
  ` * ${groups.length} new fields, every reading assigned.`,
  ' */',
  '',
  `export const MOCK_WALK_SOURCE = 'test-frames/10-survey-3-fields.txt';`,
  '',
  '/** Per-plot expectations, for the dev panel to state what should happen. */',
  'export const MOCK_WALK_PLOTS: readonly {',
  '  session_id: string;',
  '  label: string;',
  '  readings: number;',
  '  acres: string;',
  '}[] = [',
  ...summaries.map(
    (s) =>
      `  { session_id: '${s.sid}', label: '${s.label}', readings: ${s.count}, acres: '${s.acres}' },`,
  ),
  '];',
  '',
  '/** The frames themselves, in the order the walk happened. */',
  'export const MOCK_WALK_FRAMES: readonly string[] = [',
  ...all.map((p) => `  '${frameOf(p)}',`),
  '];',
  '',
];
writeFileSync(join(ROOT, 'src/dev/mockFrames.ts'), ts.join('\n'));

/* --------------------------------------------------------------- the report */

console.log(`Wrote ${all.length} frames in ${groups.length} plots\n`);
for (const s of summaries) {
  console.log(`  ${s.sid}  ${s.label}`);
  console.log(
    `    ${s.count} points, ${s.spanX}×${s.spanY} m ≈ ${s.ha} ha (${s.acres} acres), ` +
      `every point has ≥${s.minNeighbours} neighbours within ${EPS_M} m`,
  );
  console.log(
    `    means: N ${s.n} P ${s.p} K ${s.k} mg/kg · pH ${s.ph} · EC ${s.ec} µS/cm (${s.dsm} dS/m) · ` +
      `M ${s.m}% · T ${s.t}°C`,
  );
}
console.log('\n  plot separation (closest pair between plots):');
for (let i = 0; i < groups.length; i++) {
  for (let j = i + 1; j < groups.length; j++) {
    let closest = Infinity;
    for (const a of groups[i].points) {
      for (const b of groups[j].points) closest = Math.min(closest, distanceM(a, b));
    }
    console.log(
      `    ${groups[i].field.sid} ↔ ${groups[j].field.sid}: ${Math.round(closest)} m ` +
        `(needs > ${FIELD_MATCH_M} m)`,
    );
  }
}
console.log('\n  test-frames/10-survey-3-fields.txt');
console.log('  test-frames/11-survey-3-fields-packed.txt');
console.log('  src/dev/mockFrames.ts');
console.log('\nAll clustering and validation invariants hold. Run `npm run verify:frames` next.');
