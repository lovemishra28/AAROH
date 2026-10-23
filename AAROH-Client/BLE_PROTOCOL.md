# Mobile ↔ stick BLE protocol

The GATT contract between the AgroPulse app (**central**) and the Aaroh sensing stick
(**peripheral**, an ESP32), plus how to stand in for the stick with a second phone while the
hardware does not exist yet.

The app-side implementation of everything below lives in `src/lib/ble/`:
`BleService.ts` (radio), `FrameParser.ts` (wire format), `types.ts` (domain model),
`BleContext.tsx` (the only surface the UI sees).

---

## 1. GATT contract

| Role | UUID |
| --- | --- |
| Service | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| Sensor characteristic (**Notify**) | `beb5483e-36e1-4688-b7f5-ea07361b26a8` |
| Command characteristic (**Write**) | `8b72e519-54d9-4de7-91f8-00a44f931d8c` |

The service UUID **should** also appear in the advertising packet, together with the
Complete Local Name. Neither is required — the app scans without a UUID filter, because a
128-bit UUID plus a name does not always fit in the 31-byte legacy advertisement, and
filtering would then hide the stick completely. Advertising it only means the entry sorts to
the top of the picker and is labelled as a sensing stick.

The app matches the service **after** connecting. A device that does not expose it is
rejected with the `service_not_found` failure, which is what the picker shows when you tap a
laptop or a pair of earbuds by mistake.

### Notification behaviour

The stick pushes one frame per measurement point on the sensor characteristic; the app never
polls. Notifications begin as soon as the app subscribes (which happens automatically on
connect) and stop on disconnect.

### MTU

The app requests **512** immediately after connecting, and logs whatever the peripheral
grants. Failure is non-fatal: at the 23-byte ATT default a frame simply arrives across
several notifications, and the reassembly buffer joins them. Do not assume one notification
equals one frame — that assumption is exactly what breaks the day a frame grows past the
negotiated payload.

---

## 2. Frame format

ASCII, one reading per line, `KEY:value` pairs separated by commas, **terminated by `\n`**.
Firmware must send the terminator: it is the frame delimiter, and it is the only thing that
distinguishes a complete frame from a half-delivered one at the moment it arrives.

The app does not *rely* on it, because a hand-driven sender or a wedged stick will eventually
omit it. Recovery has two parts: the buffer re-syncs on each `ID:`, so frames packed into one
notification are separated; and a frame left unterminated is flushed after 400 ms of silence.
The one key permitted ahead of `ID` is `V`, and the resync keeps it attached to the frame that
follows — cutting it away would downgrade a future-version frame to v1 and let this build
misread it, which is the exact failure the version gate exists to prevent.

```
ID:P123,FW:1.0.2,N:100.5,P:20.1,K:30.0,pH:7.1,EC:1200,M:15,T:24.5,Lat:26.223,Lng:78.112,TS:1693353600
```

| Key | Meaning | Unit | Required |
| --- | --- | --- | --- |
| `V` | frame-format version | integer | no (absent ⇒ 1) |
| `ID` | probe id | string | **yes** |
| `FW` | firmware version | string | no (⇒ `unknown`) |
| `MDL` | hardware model | string | no |
| `SID` | session id — groups one walk of a field | string | no |
| `N` `P` `K` | nitrogen / phosphorus / potassium, **elemental** | mg/kg | for a usable reading |
| `pH` | pH | 0–14 | no |
| `EC` | electrical conductivity | µS/cm | no |
| `M` | moisture, volumetric water content | % | no |
| `T` | soil temperature | °C | no |
| `Lat` `Lng` | GPS fix | decimal degrees | no |
| `TS` | measurement time | Unix **seconds** | no (⇒ phone clock) |

N, P and K are elemental mg/kg. The server converts to the oxide basis (`p2o5_kgha`) — the
stick must never send oxide values under the `P`/`K` keys.

### Versioning and forward compatibility

`parseFrame` ignores keys it does not know (recording their names in
`metadata.unknown_keys` for field reports) and returns `null` for every field the frame
omits. A v2 firmware that adds a zinc sensor therefore keeps working against an old app
build, and this app keeps working against an old stick. Bump `V` only for a change that
alters the meaning of an existing key; `SUPPORTED_FRAME_VERSION` in `FrameParser.ts` gates
anything higher, and frames above it are dropped rather than misread.

`parseFrame` never throws — it runs inside a notification callback, where a throw would kill
the subscription — and returns `null` for anything without an `ID`, which is how noise from
a non-Aaroh peripheral is discarded.

---

## 3. Standing in for the stick with nRF Connect

Two Android phones: **phone A** runs AgroPulse, **phone B** runs nRF Connect for Mobile and
pretends to be the stick. Phone B needs *both* halves — a GATT **server** (so there is
something to connect to) and an **advertiser** (so phone A can see it). Configuring only one
is the usual reason nothing appears.

### 3a. GATT server on phone B

nRF Connect → hamburger menu → **Configure GATT server** → **Add service**:

- UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, type **Primary**

Add two characteristics to that service:

| # | UUID | Properties | Permissions |
| --- | --- | --- | --- |
| 1 | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | **Notify** (and Read) | Read |
| 2 | `8b72e519-54d9-4de7-91f8-00a44f931d8c` | **Write** | Write |

On characteristic 1 also add a descriptor **Client Characteristic Configuration**
(`0x2902`) — Android will not deliver notifications without it.

Save the configuration, then go back to the **Server** tab and make this configuration the
active one. It is not enough to have created it.

### 3b. Advertiser on phone B

nRF Connect → **Advertiser** tab → **+** → new configuration:

- **Advertising data** → add **Complete Local Name**. Set the display name of phone B to
  something recognisable first (Settings → About phone → Device name), e.g. `AAROH-TEST`.
- **Advertising data** → add **Service UUID** → `4fafc201-1fb5-459e-8fcc-c5c9c331914b`.
  If the packet overflows, move the Service UUID to the **Scan response** instead — Android
  scans read both.
- Options: **Connectable ✔**, **Legacy/deprecated advertising ✔**, TX power High, interval
  the fastest offered (100 ms).

Save, then flip the configuration's toggle **on**. The advertiser stops when nRF Connect is
swiped away, and on some phones when the screen locks — keep it in the foreground.

### 3c. Sending a frame

With phone A connected, in nRF Connect's **Server** tab open characteristic
`beb5483e-…`, set the value as **UTF-8 text**, and send it as a **notification**:

```
ID:P-TEST,FW:0.0.1,N:120,P:24,K:180,pH:6.8,EC:900,M:22,T:26.5,Lat:26.2183,Lng:78.1828,TS:1693353600
```

The trailing newline matters. If nRF Connect's text field will not accept one, switch the
value type to **bytes** and append `0A` to the hex.

---

## 4. When the picker shows nothing (or only your laptop)

Work down this list; each item has silently produced an empty or near-empty list at least
once during development.

1. **You are on a development build, not Expo Go.** BLE is a native module. Expo Go cannot
   load it, so nothing scans at all. Run `npx expo run:android`.
2. **The native project predates the Bluetooth permissions.** If `android/` was generated
   before `app.config.ts` gained the BLE plugin, the manifest has no BLE permissions and the
   scan returns nothing with no error. Fix:
   `npx expo prebuild --clean --platform android && npx expo run:android`.
3. **Location is off at the OS level.** Android requires Location *services* — not just the
   permission — for BLE scan results. USB debugging does not bypass this. The picker now
   reports `location_services_off` with a link into settings.
4. **Permission denied earlier.** Android does not re-prompt after a denial. Settings → Apps
   → AgroPulse → Permissions → **Nearby devices** (Android 12+) and **Location**.
5. **Android's scan quota.** More than five `startScan` calls in 30 seconds and Android stops
   delivering results — silently, with no error and no callback. `SCAN_COOLDOWN_MS` (7 s) and
   the once-per-open auto-scan guard in the modal exist for this; if you have been
   hammering the button, wait 30 seconds.
6. **Phone B's advertiser is not actually running.** Its toggle switches itself off when nRF
   Connect is backgrounded on many builds. Confirm from a *third* device, or from nRF Connect
   on phone A, that `AAROH-TEST` is visible at all.
7. **Phone B is already connected to something.** An Android peripheral usually stops
   advertising once a central connects. Disconnect any earlier session first.

### Reading the logs

Every lifecycle step logs under `[ble]` in development (`log()` in `BleService.ts`, gated on
`IS_DEV`). A healthy session looks like:

```
[ble] scan start
[ble] state → Scanning
[ble] scan stop 14 device(s)
[ble] connect → C4:4F:33:11:22:33
[ble] mtu 512
[ble] state → Connected
[ble] frame P-TEST 0.0.1
```

`scan stop 0 device(s)` means the radio never reported anything — that is items 1–5 above,
not a parsing problem. Connecting and then seeing `service_not_found` in the picker means the
scan is fine and you tapped a device that is not the stick; `[ble] connected device exposes …`
lists the UUIDs it did have.
