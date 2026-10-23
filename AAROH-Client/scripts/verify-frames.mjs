/**
 * Runs every frame in `test-frames/` through the real parser and asserts each one behaves the
 * way its note says it should. This is the substitute for a unit-test runner: the client has
 * no vitest/jest, but the frame decoder is the one piece where a silent regression is
 * invisible in the UI — a dropped frame just looks like a stick that did not send anything.
 *
 *   node --experimental-strip-types scripts/verify-frames.mjs
 *
 * Requires Node 22+ (it imports `FrameParser.ts` directly, so the shipped code is what gets
 * tested — not a copy). The splitter lives inside `BleService.ts`, which cannot be imported
 * here because it pulls in the native BLE module, so its source is lifted out by name; if
 * that extraction ever fails the script errors instead of quietly testing nothing.
 *
 * Expectations come from the notes in the frame files themselves: the most recent `ACCEPTED`
 * or `REJECTED` in a `#` comment applies to the frames beneath it, defaulting to ACCEPTED.
 * That keeps one source of truth — a file whose note and behaviour disagree fails here.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Lifts `splitOnFrameStarts` out of BleService so this check cannot drift from shipped code. */
async function loadSplitter() {
  const src = readFileSync(join(ROOT, 'src/lib/ble/BleService.ts'), 'utf8');
  const start = src.indexOf('const VERSION_PREFIX_RE');
  const fnAt = src.indexOf('function splitOnFrameStarts');
  const end = fnAt === -1 ? -1 : src.indexOf('\n}', fnAt) + 2;
  if (start === -1 || end < 2) {
    throw new Error('splitOnFrameStarts not found in BleService.ts — update this script');
  }
  const file = join(mkdtempSync(join(tmpdir(), 'aaroh-frames-')), 'splitter.ts');
  writeFileSync(file, `${src.slice(start, end)}\nexport { splitOnFrameStarts };\n`);
  return (await import(pathToFileURL(file).href)).splitOnFrameStarts;
}

const splitOnFrameStarts = await loadSplitter();
const { parseFrame, isSupportedVersion, isValidReading, isStorableFrame } = await import(
  pathToFileURL(join(ROOT, 'src/lib/ble/FrameParser.ts')).href
);

/** One frame line plus the verdict its preceding note claims. */
function readCases(text) {
  const cases = [];
  let expected = 'accept';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const marks = line.match(/ACCEPTED|REJECTED/g);
      if (marks) expected = marks[marks.length - 1] === 'ACCEPTED' ? 'accept' : 'reject';
      continue;
    }
    cases.push({ line, expected });
  }
  return cases;
}

function describeFrame(frame) {
  const r = frame.reading;
  const m = frame.metadata;
  const gps = r.lat === null || r.lng === null ? 'no GPS' : `${r.lat},${r.lng}`;
  const when = r.timestamp ? r.timestamp.toISOString().slice(0, 16).replace('T', ' ') : 'no TS';
  const unknown = m.unknown_keys.length > 0 ? ` +[${m.unknown_keys.join(',')}]` : '';
  return `${m.probe_id} fw=${m.firmware_version} N=${r.n_mgkg} P=${r.p_mgkg} K=${r.k_mgkg} ${gps} ${when}${unknown}`;
}

/** Mirrors the order BleService applies: split, parse, version gate, range gate. */
function evaluate(line) {
  const accepted = [];
  const rejected = [];
  for (const piece of splitOnFrameStarts(line)) {
    const frame = parseFrame(piece);
    if (!frame) {
      rejected.push('not a frame');
    } else if (!isSupportedVersion(frame)) {
      rejected.push(`frame version ${frame.metadata.frame_version}`);
    } else if (!isValidReading(frame.reading)) {
      rejected.push('value out of range or required nutrient missing');
    } else if (!isStorableFrame(frame)) {
      // isStorableFrame is what the app actually calls; if it disagrees with the two gates
      // above, storage and display have diverged and that is worth failing loudly for.
      rejected.push('isStorableFrame disagrees with the gates above');
    } else {
      accepted.push(describeFrame(frame));
    }
  }
  return { accepted, rejected };
}

let failures = 0;
const files = readdirSync(join(ROOT, 'test-frames'))
  .filter((name) => name.endsWith('.txt'))
  .sort();

for (const name of files) {
  console.log(`\n${name}`);
  const cases = readCases(readFileSync(join(ROOT, 'test-frames', name), 'utf8'));
  for (const { line, expected } of cases) {
    const { accepted, rejected } = evaluate(line);
    const ok =
      expected === 'accept'
        ? accepted.length > 0 && rejected.length === 0
        : accepted.length === 0 && rejected.length > 0;
    if (!ok) failures += 1;
    const verdict = accepted.length > 0 ? accepted.join(' | ') : rejected.join(' | ');
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${expected.padEnd(6)} ${verdict}`);
    if (!ok) console.log(`       frame: ${line.slice(0, 160)}`);
  }
}

const total = files.reduce(
  (sum, name) => sum + readCases(readFileSync(join(ROOT, 'test-frames', name), 'utf8')).length,
  0
);
console.log(`\n${total - failures}/${total} frames behaved as documented`);
if (failures > 0) process.exitCode = 1;
