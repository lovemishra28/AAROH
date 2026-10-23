# Test frames for the sensing stick

Ready-to-send payloads for standing in for the Aaroh stick with nRF Connect on a second
phone. The GATT setup itself is in [`../BLE_PROTOCOL.md`](../BLE_PROTOCOL.md) §3 — do that
first, then send the frames here.

Every file holds **one frame per line**. Send one line at a time as a notification on
`beb5483e-36e1-4688-b7f5-ea07361b26a8`. Lines beginning with `#` are notes explaining what
the frame under them proves — do not send those.

## How to send one

1. Phone B: nRF Connect → **Server** tab → the active Aaroh configuration → tap
   characteristic `beb5483e-…`.
2. Set the value type to **UTF-8 text**, paste one line, and add a newline at the end. If
   the text field refuses a newline, switch to **bytes** and append `0A` to the hex.
3. Send it as a **Notification** (not Indication, not Read response).
4. Phone A: the reading appears under **Analysis → Stick scans**, newest first, stamped with
   the time it arrived. Metro logs `[ble] frame <probe> <firmware>`.

nRF Connect keeps recently-sent values in a dropdown on that characteristic, so a frame only
has to be typed once — after that, pick it from the list and change the digits you want.

The trailing newline is the frame delimiter. It is not strictly required any more (the app
flushes an unterminated frame after 400 ms of silence and re-syncs on `ID:`), but sending it
is what a real stick does, so test with it.

## The files

| File | What it proves |
| --- | --- |
| `01-single-reading.txt` | The happy path: one frame in, one row in Analysis. |
| `02-field-a-walk.txt` | Eight points a few metres apart — one field, one session. |
| `03-field-b-walk.txt` | Six points ~2.9 km away — must become a *second* field. |
| `04-edge-cases.txt` | Optional keys missing, no GPS, no clock, extra whitespace, real zeros. |
| `05-malformed.txt` | Frames that must be **rejected**, each with the reason. |
| `06-future-firmware.txt` | Unknown sensor keys, a version bump, packed and unterminated frames. |
| `10-survey-3-fields.txt` | The full acceptance run: 90 readings, three plots, three fields. |
| `11-survey-3-fields-packed.txt` | The same 90 readings, three per notification — 30 sends. |

Files 02 and 03 are the input for Workstream 2 (server-side clustering): send all of 02,
then all of 03, and the backend should end up with two fields rather than one or fourteen.
One of 03's six points has no neighbour inside the server's 40 m radius — its nearest is 59 m
away — so it is reported as unassigned and the second field holds five. Deliberate, and the
smallest example of what an outlier looks like in the sync report.

## The three-field survey (10 and 11)

This is the file to use for a real end-to-end test. It is a simulated morning's work: three
plots near Gwalior, walked in a serpentine pattern, 30 probe points each.

| Session | Points | Size | Soil |
| --- | --- | --- | --- |
| `S1-0829` | 30 | ~2.2 acres | Nitrogen-poor, slightly acidic — N 81, P 10, K 138, pH 6.1, EC 0.44 dS/m |
| `S2-0829` | 30 | ~1.8 acres | Well supplied — N 152, P 31, K 225, pH 7.0, EC 0.94 dS/m |
| `S3-0829` | 30 | ~2.6 acres | Alkaline and salt-affected, K-rich — N 112, P 22, K 293, pH 8.0, EC 2.24 dS/m |

The three signatures are deliberately far apart, so the dashboard's averages and the advice
it produces should differ obviously between plots — if switching fields doesn't visibly
change the numbers, something is wired to the wrong field.

Inside each plot the values follow a **gradient** rather than scattering randomly (N and K
rise eastward in `S1`, everything richer to the north in `S2`, salinity climbing towards one
corner in `S3`). That is what makes the heat map worth looking at: random noise would render
as confetti, and a plot that is genuinely uniform would render as one flat colour.

The geometry is what the clustering depends on, and it is checked rather than assumed. Points
sit on a jittered 18–22 m grid, so every one of them has at least three neighbours within the
server's 40 m radius and none is dropped as an outlier; the plots are 727 m, 1167 m and
1181 m apart, far beyond the 120 m at which a point would join an existing field. The nearest
of the three also sits ~1.7 km clear of the `02` walk, with `03` a further 2.8 km out, so this
file creates three *new* fields even on an account that has already synced those.

**Expected result after sending the file and syncing once:** three new fields, 30 readings
each, 90 assigned and none unassigned. The full pass criteria — the per-plot means the
dashboard should show, what the heat map should look like, and what a second sync should do —
are in [`../FIELD_SEGREGATION_TEST.md`](../FIELD_SEGREGATION_TEST.md).

Tapping sync a second time uploads nothing: a confirmed scan leaves the pending set, so the
button reports "No new scans to upload". Underneath that, the server dedupes on
`idempotency_key`, which is the scan's **local id on the phone** — that covers a retry after a
dropped response. It does *not* cover clearing the scan log and re-loading the same walk: those
scans get new ids, so they are stored again and attach to the fields they already created
(inside the 120 m match radius), taking each field to 60 readings. Correct, but surprising if
you were expecting the file itself to be deduplicated.

### Sending it

Use `11-survey-3-fields-packed.txt`: it carries three frames per line, which the app splits
apart on each `ID:`, so the whole survey is 30 notifications instead of 90. Each line is
under 400 characters and fits a single notification at the negotiated MTU. Line order is the
order the walk happened in, and each plot's block is separated by a `#` note.

`10-survey-3-fields.txt` is the same data one frame per line. Use it when you want to send a
handful of individual points, or to read the data.

Both files are generated:

```
npm run mock:frames
```

The generator lays the walk out in metres, asserts the clustering invariants above, and only
then writes the files — it exits non-zero rather than emitting a dataset that would cluster
wrongly. It also regenerates `src/dev/mockFrames.ts`, so the frames the app's dev-only
**Load demo walk** button feeds through the parser are byte-identical to these. Do not edit
any of the three by hand; change `scripts/make-mock-walk.mjs` and re-run. Output is
deterministic, so a regeneration with no source change produces no diff.

### Without a second phone

In a development build, **Analysis → Stick scans** shows a dashed **Load demo walk** card.
It pushes the same 90 frames through the same `parseFrame` and storability gates and records
them the same way a notification would, so everything downstream of the radio — the scan
list, sync, clustering, field creation, averages, the heat map, the switcher — can be tested
on one device. Tapping it twice is a no-op rather than a duplicate. What it does *not* cover
is reassembly of split notifications; that is what `npm run verify:frames` is for.

## Checking the pack without a phone

```
npm run verify:frames
```

This runs every frame here through the real `FrameParser.ts` and the real frame splitter out
of `BleService.ts`, and asserts each one behaves the way its note claims. Expectations are
read from the notes themselves — the nearest preceding `ACCEPTED` or `REJECTED` — so a note
and the code cannot disagree without the run failing. Needs Node 22+. It is the closest thing
the client has to a unit test for the decoder, so run it after touching either file.

## Reading the result on phone A

- **Analysis → Stick scans** lists each accepted reading with date, time and values. GPS
  shows as `26.21830, 78.18280`, or "No GPS fix" when `Lat`/`Lng` were absent.
- Long-press a row to delete it; **Clear scans** empties the list.
- The list holds the most recent 100 readings and survives closing the app.

A frame that is rejected produces no row. In a dev build, Metro says why:

```
[ble] frame P-A1 1.0.2                                  ← accepted
[ble] unparseable fragment, ignored: ID:P-A1,FW:1.0.2    ← no measurement keys
[ble] fragment with values but no ID — sender split the frame: N:120,P:24,…
```

That last line is the signature of a stray newline **inside** the value you pasted: the
identity ended up in one frame and the numbers in another, and no amount of buffering can
put them back together. Retype the value on a single line.
