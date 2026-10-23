# Automatic field segregation — end-to-end acceptance test

**Date:** 2026-08-29 · **Scope:** Workstream 2 (server-side clustering) + Workstream 3 (dashboard, heat map, field switcher) · **Repos:** `C:\AAROH-Client` and `C:\AAROH-Server`

One walk of the stick, one tap, three fields on the map. This document is the procedure for
proving that end to end, with the exact numbers to check against. Phase 3's own test plan
(`PHASE_3_TEST_AND_RELEASE.md`) covers the manual-input path and still applies; this is the
layer built on top of it.

---

## 0. What is being tested

| Workstream | Claim | Where it lives |
|---|---|---|
| **2** | Readings arrive with coordinates and no field. The server groups them, creates a field per group, draws its boundary, computes its area, and stores the mean of the seven measurements. Points near an existing field join it instead. | `AAROH-Server/api/src/modules/segregation/` |
| **3** | The dashboard leads with **Connect stick & sync**, not "create a field". After a sync it names what changed, offers a pill per detected field, and redraws the averages, the fertility map and the advice button for whichever pill is tapped. | `AAROH-Client/src/features/{home,sync,fields}/` |
| **data** | A file in the stick's own wire format carrying 90 readings across three plots, which must land as exactly three fields of 30. | `AAROH-Client/test-frames/10-…`, `11-…` |

There is no physical stick yet, so the radio is stood in for by a second phone running nRF
Connect (or, on one device, by a dev-only button). Everything above the radio — parsing,
storage, sync, clustering, aggregation, rendering — is the real code path.

---

## 1. Before you plug anything in

Six of these seven commands were run and passed in my sandbox; run them yourself anyway, since
they take a minute and they localise a failure before a phone is involved.

```bash
cd C:\AAROH-Client
npm run typecheck        # tsc --noEmit
npm run verify:frames    # every test frame through the real parser + splitter
npm run mock:frames      # regenerates the survey; re-asserts its geometry

cd C:\AAROH-Server\api
npm run typecheck
npm run lint
npm test                 # vitest — the one I could not run (see §7)
npm run verify:clustering # the survey through the real DBSCAN, at the real config
```

`verify:clustering` is the important one, and its output is the answer key for the rest of
this document. This is the whole of it, verbatim — if yours differs anywhere below the first
line, stop and read §8 before touching a phone:

```
…/AAROH-Client/test-frames/10-survey-3-fields.txt

  90 readings read
  dbscan(eps=40 m, minPoints=3) → 3 clusters, 0 noise

  S1-0829: 30 points, 127 m across
    centroid 26.20485, 78.16171
    means N 81 · P 10.0 · K 138 · pH 6.11 · EC 442 · M 16.1 · T 27.4
  S2-0829: 30 points, 116 m across
    centroid 26.20980, 78.16816
    means N 152 · P 31.0 · K 225 · pH 6.99 · EC 943 · M 24.6 · T 26.7
  S3-0829: 30 points, 143 m across
    centroid 26.19899, 78.17295
    means N 112 · P 21.6 · K 293 · pH 8.03 · EC 2243 · M 27.9 · T 28.4

  centroid separation:
    S1-0829 ↔ S2-0829: 848 m (match radius 120 m)
    S1-0829 ↔ S3-0829: 1297 m (match radius 120 m)
    S2-0829 ↔ S3-0829: 1294 m (match radius 120 m)

  plots distinguishable by mean:
    S1-0829 ↔ S2-0829: 5 of 7 metrics differ by >15% (N, P, K, EC, M)
    S1-0829 ↔ S3-0829: 6 of 7 metrics differ by >15% (N, P, K, pH, EC, M)
    S2-0829 ↔ S3-0829: 4 of 7 metrics differ by >15% (N, P, K, EC)

OK — 90 readings cluster into 3 well-separated fields with nothing left over.
The means above are what the dashboard should show for each plot.
```

Note that the means here are printed at the script's own precision, not the app's — §4 gives
the rounded values the tiles will actually show, and EC is in µS/cm here but dS/m on screen.

It imports the shipped `dbscan.ts` and `segregation.config.ts` directly, so if someone
changes `CLUSTER_EPS_M` or `FIELD_MATCH_RADIUS_M` this check moves with them and tells you
before the phone does. What it does *not* touch is PostGIS: hulls, areas and match-or-create
are SQL and need the database, which is what §4 is for.

---

## 2. Bring the stack up

```bash
cd C:\AAROH-Server
docker compose up --build db ai          # host port 5433 → container 5432

cd api
npm run migrate:up                       # includes the segregation + aggregate migration
npm run seed
npm run dev                              # → http://localhost:3000

cd C:\AAROH-Client
npx expo run:android                     # dev client, so the demo loader is available
```

Two things reliably waste an hour if they are wrong. The database is published on **5433**,
not 5432 — a native PostgreSQL install owns 5432 and Windows will route you to it silently,
producing an authentication error that looks like a bad password. And the emulator reaches the
host at `http://10.0.2.2:3000`, which is already the default; a **physical** phone needs your
PC's LAN IP instead.

Sign in on the phone before syncing. Readings are stored against the signed-in farmer, and a
401 mid-sync leaves the scans pending — recoverable, but confusing.

---

## 3. Get the 90 readings onto the phone

Three routes to the same 90 frames. They are generated from one array, so the file a phone
sends and the frames the button loads are byte-identical.

**A — one device (fastest).** In a dev build, **Analysis → Stick scans** shows a dashed **Load
demo walk** card reading "90 readings across 3 plots — a sync should create 3 fields". Tap it.
*Pass: "Loaded 90 demo scans", and the count line reads "90 scans · 0 of 90 uploaded".* The list
below it shows the five most recent rows, newest first, each with a GPS position — tap **View all**
to see the remaining 85. Tapping the loader again says "Already loaded — nothing new to add"
rather than duplicating.

**B — two phones, packed (closest to real).** Send
`test-frames/11-survey-3-fields-packed.txt`, one line per notification on
`beb5483e-36e1-4688-b7f5-ea07361b26a8`. Thirty lines, three readings each: the app resyncs on
every `ID:`, so a packed line decodes to three rows. GATT setup is in
[`BLE_PROTOCOL.md`](BLE_PROTOCOL.md) §3; the sending mechanics are in
[`test-frames/README.md`](test-frames/README.md).

**C — two phones, one frame per line.** `test-frames/10-survey-3-fields.txt`, 90 sends. Only
worth it when you are debugging a single point.

Route A skips the radio entirely and route B exercises it; neither covers reassembly of a
notification split mid-frame, which is what `npm run verify:frames` is for.

Whichever route, the precondition for §4 is the same: **90 scans in the list, none uploaded
yet, every one carrying a position.** On **Analysis** the line under the sync card reads "90
scans · 0 of 90 uploaded · Saved on this phone"; on **Home** the **Upload stick scans** card
says "90 scans waiting to upload".

Start from an empty list — **Clear scans** first if you have been testing with the other frame
files. Anything still pending goes up in the same batch, and the `02` walk sits ~1.7 km from the
nearest survey plot with `03` ~4.5 km out, so all three files together are 104 readings that
cluster into **five fields and one stray point** instead of three, and you would spend a while
wondering why. (The log keeps the most recent 100 readings, oldest dropped first, so old scans
are the ones that fall off — the 90 you just loaded are safe either way.)

---

## 4. Sync once — the acceptance criteria

On **Home**, the primary button now reads **Sync 90 scans**. Tap it once.

A "Sync complete" block appears under the button. Pass is exactly this, and nothing more:

| Line | Expected |
|---|---|
| `90 readings saved` | all of them; a smaller number means part of the walk was rejected |
| `3 new fields detected` | not 1, not 2, not 14 |
| three field rows | each **New**, each "30 readings added" |
| *absent* | "points were too far from any field" — no unassigned points |
| *absent* | "readings were not accepted" — no rejections |
| *absent* | "had no usable GPS fix" — every point carried a position |

Then check the numbers. Tap each pill under **Detected fields** and read the seven **Field
average** tiles against this table. These are what the tiles will *display* — the app rounds each
metric to its own input precision (N, P, K, moisture and temperature to whole numbers, pH to one
decimal, EC to two) and drops trailing zeros, so the underlying means printed by
`verify:clustering` in §1 carry more digits than the screen does. EC is also the one metric whose
display unit differs from storage: µS/cm ÷ 1000.

| Plot | N mg/kg | P mg/kg | K mg/kg | pH | EC dS/m | Moisture % | Temp °C | Area |
|---|---|---|---|---|---|---|---|---|
| canal side (`S1-0829`) | 81 | 10 | 138 | 6.1 | 0.44 | 16 | 27 | ~2.2 acres |
| well supplied (`S2-0829`) | 152 | 31 | 225 | 7 | 0.94 | 25 | 27 | ~1.8 acres |
| saline low ground (`S3-0829`) | 112 | 22 | 293 | 8 | 2.24 | 28 | 28 | ~2.6 acres |

So pH reads a bare `7` on the well-supplied plot rather than `6.99`, and the temperature tile
reads `27` on two of the three plots — neither is a rounding bug. The metrics that carry the
demo are N, K and EC, and those are unambiguous: 81/138/0.44 against 152/225/0.94 against
112/293/2.24.

Identify each plot by its signature rather than by its number — one is nitrogen-poor and
slightly acidic, one is well supplied and near-neutral, one is alkaline, potassium-rich and
five times as salty as the first. All three were created in the same sync, so which one is
called "Field 1" is not worth asserting.

Areas are approximate on purpose. The boundary is a hull of the walked points buffered by 4 m —
concave when there are at least five points and the concave result keeps more than half the
convex hull's area, convex otherwise — so it is a little larger than the grid the generator laid
out and a little smaller than the plot a farmer would claim. Anything in the 1.5–3.5 acre range
for each plot is right; `0.00 acres` or "Area not set" is not, and means the hull or the area
computation failed.

Each field row in the sync report is tappable and opens that field's detail screen. Note that
the tiles there show the field's **latest single reading**, under "Latest soil reading" — not the
average — so do not compare them against the table above. The fertility map on that screen is the
same one as on the dashboard.

---

## 5. The fertility map and the switcher

Under the averages sits **Fertility map**, with a chip per metric (N, P, K, pH, EC, %, T) and a
line beneath it reading "30 probe points · Pale = less · Deep = more · Tap a point to see its
reading". North is up, east is right. The surface between points is interpolated; the dots are
the actual probe points.

The three plots were built with *gradients* rather than random scatter, so each one has a
direction you can check by eye. This is the part of the test a screenshot cannot fake:

| Plot | On the **N** chip | On the **pH** chip |
|---|---|---|
| canal side | deepens **left → right** (nitrogen rises eastward) | deepens **bottom → top** |
| well supplied | deepens **bottom → top** | deepens **left → right** |
| saline low ground | deepens toward the **top-right corner** | same corner — pH and salinity climb together |

On the saline plot, switch to the **%** (moisture) chip: it should deepen toward the *opposite*
corner, bottom-left. A metric whose gradient runs the other way is worth one look, because it
proves the colour ramp is being driven by the data rather than by the position on screen.

*Pass:* a visible direction, not confetti and not one flat colour. Confetti means the map is
plotting values against the wrong positions; flat means every point is being given the same
value. The count under the map should read `30 probe points` for every plot, and tapping a dot
should show that reading's own value and the time it was taken.

Then the switcher itself. Tap between pills and watch three things change together: the seven
average tiles, the map, and the field the **Get advice for this field** button will use.

*Pass:* between any two plots at least four of the seven tiles change visibly. `verify:clustering`
requires at least three metrics to differ by more than 15% between every pair of plots, and the
current data manages five, six and four respectively — the counts printed under "plots
distinguishable by mean" in §1. A switcher that changes the highlight but not the numbers is the
specific failure this dataset exists to catch. Each pill also carries a **`locate`** icon
(auto-detected) rather than a leaf (created by hand), "30 readings", and its area.

Finally, tap **Get advice for this field** on the saline plot and on the well-supplied plot.
*Pass:* materially different advice — different crops or different fertiliser quantities. Two
plots this far apart in pH, EC and NPK should not produce the same recommendation.

---

## 6. Sync again — what should and should not happen

Back on **Home**, look at the sync button again. With nothing left pending it has flipped back to
**Connect stick & sync** and the line above it reads "Every scan is uploaded" — that flip *is* the
pass signal, and tapping it now opens the stick picker rather than re-uploading anything. ("No new
scans to upload" is the message for the rarer case where the log emptied between render and tap.)
*Pass: no new fields, no changed reading counts, the sync report from §4 still on screen.*

The same card also sits on **Analysis**, above the scan list, and drives the same mutation — but
it is rendered there without a connect handler, so once nothing is pending its button is
**disabled** rather than opening the picker. That is deliberate, not a dead button: connecting a
stick is a dashboard action. Check the flip on Home.

Server-side deduplication exists underneath that, keyed on `idempotency_key`, which is the
scan's **local id** on the phone. Its job is the dropped-response case: if the app sends a
batch and never hears back, the retry stores nothing twice and reports the points as
duplicates. That is not reproducible by hand without killing the network mid-request, so treat
§4's clean run plus this no-op as the acceptance criterion.

One trap worth knowing, because it looks exactly like a dedupe bug and is not. If you **Clear
scans** and load the demo walk again, the 90 scans get *new* local ids, so they are new
readings as far as the server is concerned. Syncing then reports "3 existing fields updated"
and each field goes to 60 readings — the points fall inside the 120 m match radius of the
fields they created, so they attach rather than making a second set of fields. That is correct
behaviour. To start genuinely clean:

```bash
cd C:\AAROH-Server
docker compose down -v          # drops the aaroh_db_data volume
docker compose up --build db ai
cd api && npm run migrate:up && npm run seed
```

Two further behaviours worth a minute if you have time. Sending `02-field-a-walk.txt` and then
`03-field-b-walk.txt` (from `test-frames/`) should produce two more fields, ~2.9 km apart — that
is the smallest possible version of the same claim, and note that `03` carries six readings of
which one sits far enough out to be reported as unassigned. And re-walking a plot that already
exists — send a handful of lines from the middle of the survey after a clean sync — should
report "1 existing field updated" and move that field's averages, not create a fourth field.

---

## 7. What I verified vs. what needs your device

| Check | Status | Who |
|---|---|---|
| Client `tsc --noEmit` | ✅ 0 errors | me |
| Client `verify:frames` (154 assertions over the frame pack) | ✅ | me |
| Client `mock:frames` — 90 readings, geometry invariants asserted | ✅ | me |
| Server `tsc --noEmit` | ✅ 0 errors | me |
| Server `eslint .` | ✅ 0 errors, 0 warnings | me |
| Server `verify:clustering` — 3 clusters, 0 noise, 30/30/30, means as in §1 | ✅ | me |
| Server `npm test` (vitest — 11 files: `dbscan`, `sync-dto`, auth, jwt, password, Google, DTO, errors, health, AI client, and the `recommendations` integration test) | ⏳ **cannot run in my sandbox** | **you** |
| PostGIS hull, area, match-or-create, aggregate SQL | ⏳ needs the database | **you** |
| The whole of §3–§6 on a device | ⏳ | **you** |

`npm test` is not skipped by choice: both repos' `node_modules` were installed on Windows, so
only the Windows binaries of esbuild and rollup are present and vitest cannot start under my
Linux sandbox. `tsc` and `eslint` are pure JavaScript, which is why those two do run. Please
run `npm test` on Windows before trusting the clustering unit tests — everything I could check
without a native binary is green. Worth running it *after* §2 rather than before: the
`recommendations` integration test skips itself when the database and AI service are down, so
with the stack up you get the money path proved for free.

---

## 8. If it goes wrong

| Symptom | Most likely cause |
|---|---|
| Empty device picker when connecting | Android needs location **services on** (not just the permission) to return BLE scan results. See `BLE_PROTOCOL.md`. |
| Scans arrive but "0 readings saved" | Not signed in, or the base URL is wrong — `10.0.2.2` on the emulator, LAN IP on a physical phone. |
| "1 new field detected" instead of 3 | Only part of the file was sent. Check the count line reads "90 scans" before syncing. |
| 4 or 5 fields detected, often with a point "too far from any field" | Scans from an earlier test were still pending and went up in the same batch. Clear scans, reset the database, start again. |
| 2 fields instead of 3 | `CLUSTER_EPS_M` or `FIELD_MATCH_RADIUS_M` has been changed. Re-run `verify:clustering`; it reads the live config and will say so. |
| Many points "too far from any field" | Coordinates lost in transit. A scan row showing "No GPS fix" cannot be clustered. |
| Fields created, map says "no GPS position" | Readings stored without `location` — check the sync report for the "no usable GPS fix" line. |
| `verify:clustering` says "carries 3 frames packed together" | You pointed it at `11-…-packed.txt`. It needs `10-survey-3-fields.txt`. |
| Authentication failed against Postgres | You are talking to a native PostgreSQL on 5432 instead of the container on **5433**. |
| A tile reads `7` where you expected `6.99`, or `27` on two plots | Not a bug — each metric renders at its own precision and trailing zeros are dropped. §4's table is the authority, not §1's means. |
| Areas show as "Area not set" or `0.00 acres` | Hull or area computation failed; check the API log for a PostGIS error during sync. |
| The field-detail tiles disagree with the switcher's tiles | Also not a bug — the detail screen shows that field's **latest single reading**, the dashboard shows its average. |

---

**Bottom line.** Everything that can be proved without a device or a database is proved, and
the dataset is checked against the shipped clustering code rather than assumed to be good. What
remains is §3–§6 on your emulator against the live server, plus `npm test` on Windows. If the
sync report reads "90 readings saved · 3 new fields detected", three rows of "30 readings
added", and the averages match the table in §4, Workstreams 2 and 3 are done.
