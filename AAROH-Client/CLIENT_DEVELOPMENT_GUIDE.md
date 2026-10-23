# Aaroh — Client (Mobile App) Development Guide

**Repository:** `aaroh-client`
**Scope:** The React Native mobile app farmers and field agents use — UI, offline-first data, BLE, and how it consumes the backend.
**Version:** 1.0 · **Date:** 2026-08-25 · **Status:** Pre-development (greenfield)
**Companion document:** `SERVER_DEVELOPMENT_GUIDE.md` (in `aaroh-server`)

> The server owns every contract; this app *consumes* them. Wherever this guide references an API shape, the authority is the server's generated `openapi.yaml`. Read §0 and §1 before scaffolding.

---

## Table of Contents

0. [How to use this guide & design principles](#0-how-to-use-this-guide--design-principles)
1. [Framework decision & core stack](#1-framework-decision--core-stack)
2. [Repository & folder structure](#2-repository--folder-structure)
3. [UI architecture & design system](#3-ui-architecture--design-system)
4. [Navigation & screen-by-screen breakdown](#4-navigation--screen-by-screen-breakdown)
5. [State management strategy](#5-state-management-strategy)
6. [Offline-first & BLE integration](#6-offline-first--ble-integration)
7. [API integration plan](#7-api-integration-plan)
8. [Authentication & role-based access](#8-authentication--role-based-access)
9. [AI recommendation visualization](#9-ai-recommendation-visualization)
10. [Error handling & resilience](#10-error-handling--resilience)
11. [Performance optimization](#11-performance-optimization)
12. [Internationalization & accessibility](#12-internationalization--accessibility)
13. [Feature implementation order](#13-feature-implementation-order)
14. [Testing approach](#14-testing-approach)
15. [Deployment strategy](#15-deployment-strategy)
16. [Quick reference](#16-quick-reference)

---

## 0. How to use this guide & design principles

Built by a **solo/lead builder** toward a **field-pilot-ready v1** in Gwalior/Chambal. The client is sequenced *behind* the server's API contract: the first full demo (master Phase 3) is a **manual-input** recommendation flow with **no hardware**, and BLE/GPS features arrive at Phase 4–5 once firmware is fixed. This lets you prove the whole advice experience early, then bolt on the probe.

### 0.1 Who uses this app, and what that forces

The user is a **smallholder farmer in rural MP**, often with **low literacy**, a **low-end Android phone**, **patchy connectivity**, and a preference for **Hindi**. Field agents and admins are secondary users. This is not a dashboard for analysts; it is a field tool. Every design principle below falls out of that reality:

1. **Offline-first is the default, not a feature. [load-bearing]** The app must be fully usable with no signal — capture readings, view cached fields and advice, queue writes — and sync opportunistically. Online-only flows are bugs.
2. **Low-literacy-first UI.** Lead with icons, colour, and imagery; pair every important label with an icon and, where feasible, **audio/TTS in Hindi**. Never rely on a wall of text or on English.
3. **Bilingual Hindi + English, Hindi-default.** Full Devanagari support, including a font that renders conjuncts correctly. Crop names always show the Hindi label (चना, गेहूं…).
4. **Big, forgiving touch targets.** Outdoor use, gloved/dusty hands, bright sun → large tappable areas, high contrast, minimal precision required.
5. **Honest about uncertainty.** Surface provenance from the backend (e.g., "NPK not yet calibrated for this probe") in plain language; never show false precision.
6. **Cheap on battery and data.** BLE scanning and sync are power/data events — make them deliberate and efficient.

### 0.2 Relationship to the master roadmap

The client's work maps onto the master phases defined in the server guide §2: app skeleton + **manual-input recommendation** at **Phase 3** (first demo), **BLE ingest + offline queue** at **Phase 4**, **field map/geo** at **Phase 5**, **pilot polish** at **Phase 6**. §13 sequences the client work against these.

---

## 1. Framework decision & core stack

You asked me to choose the React Native setup. **Decision: Expo with a Dev Client + EAS**, not bare React Native CLI. Here's the reasoning and the escape hatch.

### 1.1 Why Expo (Dev Client + EAS) [default, with a documented exit]

For a **solo builder** shipping a **BLE + offline-first** app, modern Expo is the faster path *without* giving up native capability:

- **BLE works.** `react-native-ble-plx` runs under Expo via its **config plugin** in a **Dev Client** (a custom development build that includes native modules). The old "Expo can't do Bluetooth" limitation is gone once you're on a Dev Client rather than Expo Go.
- **EAS Build** removes the biggest solo-dev tax: you don't hand-maintain Xcode/Gradle/signing. Cloud builds produce installable Android APKs/AABs (and iOS if needed) from config.
- **EAS Update (OTA)** ships JS-only fixes to pilot devices in the field without a Play Store round-trip — invaluable during a Chambal pilot where you'll iterate fast.
- **NativeWind is first-class** on Expo, matching the project's chosen styling approach.
- **Managed native config** (permissions, background modes, Devanagari fonts) via `app.config.ts` + config plugins keeps native setup declarative and reproducible — one less thing for one person to babysit.

**When bare RN would have won:** deep, custom native code (custom BLE stack, exotic background services, native modules with no Expo plugin). Aaroh needs none of that in v1 — `react-native-ble-plx` + standard background/permission plugins cover it.

**Escape hatch (documented, low-regret):** Expo projects can run `expo prebuild` to generate the native `android/`/`ios/` folders and continue as a bare project at any time, keeping your JS/TS untouched. So choosing Expo now does **not** lock you out of full native control later — it defers that cost until (if ever) you actually need it. Record this in an ADR.

### 1.2 Core stack

| Concern | Choice | Why (Aaroh-specific) |
|---|---|---|
| Framework | **Expo (Dev Client) + EAS** | §1.1 |
| Language | **TypeScript (strict)** | Types generated from the server's OpenAPI; catch contract drift at compile time |
| Styling | **NativeWind (Tailwind for RN)** | Project standard; fast, consistent design tokens |
| Navigation | **React Navigation** (native-stack + bottom-tabs) | Mature, offline-friendly, deep-link ready |
| Server state | **TanStack Query** | Caching, retries, offline persistence, background refetch |
| Client/UI state | **Zustand** | Tiny, simple global state (session, language, BLE status) |
| Offline DB | **WatermelonDB** (SQLite) *or* **op-sqlite** + a light layer | Local source of truth for fields/readings/advice + the write queue |
| Secure storage | **expo-secure-store** | JWT refresh token, device pairing secrets |
| Fast KV | **react-native-mmkv** | Flags, last-selected field, cache metadata |
| BLE | **react-native-ble-plx** (Expo config plugin) | Talk to the 7-in-1 probe |
| i18n | **react-i18next** + ICU | Hindi/English, pluralisation, number/unit formatting |
| TTS / audio | **expo-speech** (+ recorded clips) | Read advice aloud for low-literacy users |
| Forms | **react-hook-form** + **zod** | Manual reading entry (Phase 3), validation mirrors server DTOs |
| Charts | **victory-native** / **react-native-svg** | Segment A/B and soil-band visualisation |
| Maps | **react-native-maps** (or MapLibre) | Field boundary from PostGIS (Phase 5) |
| Errors/analytics | **Sentry** + lightweight product analytics | Crash + funnel visibility during pilot |

> Keep the dependency list disciplined — every native module is a Dev Client rebuild and a potential Expo-upgrade snag. Add only what a screen in §4 actually needs.

---

## 2. Repository & folder structure

**Feature-first**, not type-first: co-locate a feature's screens, components, hooks, and API calls so a solo builder navigates by capability, not by file kind.

```
aaroh-client/
├── app.config.ts            # Expo config: name, permissions, plugins (ble, fonts, secure-store)
├── eas.json                 # build/update profiles: development, preview, production
├── package.json
├── tsconfig.json            # strict
├── babel.config.js          # nativewind + reanimated plugins
├── src/
│   ├── App.tsx
│   ├── navigation/          # navigators, route types, deep-link config, role-based guards
│   ├── features/            # ── the app, by capability ──
│   │   ├── auth/            # OTP login screens, session hooks, token handling
│   │   ├── onboarding/      # language pick, permission priming, probe intro
│   │   ├── fields/          # list, detail, create; field map (Phase 5)
│   │   ├── scan/            # BLE pair + capture reading (Phase 4); manual entry (Phase 3)
│   │   ├── recommendations/ # request advice + results (Segment A/B, fertiliser cards)
│   │   ├── soil/            # soil-health interpretation view
│   │   ├── history/         # past readings & advice (offline-readable)
│   │   └── settings/        # language, account, calibration status, sync status
│   ├── components/          # shared, dumb UI: Button, Card, Icon, CropChip, EmptyState...
│   ├── ui/                  # design system: theme tokens, typography, NativeWind preset
│   ├── db/                  # WatermelonDB schema, models, migrations, sync engine
│   ├── store/               # Zustand slices (session, connectivity, ble, language)
│   ├── api/                 # generated types (from openapi.yaml) + typed client + query hooks
│   ├── ble/                 # ble-plx wrapper: scan, connect, parse frames, error mapping
│   ├── i18n/                # i18next config + hi/ en/ resource bundles
│   ├── hooks/               # cross-feature hooks (useOffline, useTts, useRole)
│   ├── lib/                 # pure utils: unit formatting, currency, date, guards
│   └── assets/              # fonts (Devanagari), icons, audio clips, crop imagery
├── __tests__/               # unit + component tests
├── e2e/                     # Maestro flows
└── docs/adr/                # client architecture decisions
```

### 2.1 Structure rationale

- **`features/` is the backbone.** Each folder is a vertical slice; shared, presentation-only pieces live in `components/` and `ui/`. This keeps the "capture a reading and get advice" journey readable in one place.
- **`api/` holds *generated* types.** A script turns the server's `openapi.yaml` into TypeScript types + typed fetchers; screens import those, never hand-typed shapes. Contract drift becomes a compile error.
- **`db/` is the offline source of truth.** UI reads from the local DB (via Query) and the sync engine reconciles with the server — not the other way around.
- **`ble/` is isolated** so BLE's messiness (permissions, disconnects, frame parsing) never leaks into screens; it exposes clean hooks/events.

---

## 3. UI architecture & design system

### 3.1 Design system before screens

Define tokens once (in `ui/`) so every screen is consistent and a solo builder never re-decides spacing or colour:

- **Typography.** A Devanagari-capable font (e.g., **Noto Sans Devanagari** for Hindi + a matching Latin face) bundled in `assets/fonts` and registered via the Expo font config plugin. Test conjunct rendering (क्ष, त्र, ज्ञ) on a real low-end Android device early — this is a common silent failure. Large base size (≥16–18 sp) with a generous type scale; farmers read at arm's length in sunlight.
- **Colour.** High-contrast, sunlight-legible palette. Reserve semantic colours: **green = grow now / good**, **amber = viable with input / caution**, **red = avoid / error**. These map directly to Segment A vs B (§9) and to soil-band flags — colour carries meaning for low-literacy users, so use it consistently.
- **Spacing & hit targets.** 8-pt spacing scale; minimum 48×48 dp tap targets; primary actions are full-width buttons.
- **Iconography.** A single icon set; every key label pairs with an icon. Crops get recognizable icons/illustrations, not just text.
- **Components (atomic).** `ui/` primitives (Text, Button, Card, Chip, Badge, Icon) → `components/` composites (CropCard, FertiliserCostCard, SoilBandBar, SegmentSection, SyncBanner, EmptyState, AudioPlayButton). Screens compose these; screens hold no raw styling.

### 3.2 Component hierarchy pattern

```
Screen (feature/*)                 owns data hooks + layout, no styling logic
  └─ Section / composite            components/*  (CropCard, FertiliserCostCard…)
       └─ Primitive                 ui/*          (Text, Button, Card, Icon)
```

State/props flow **down**; events flow **up** via callbacks; server data comes from Query hooks, never prop-drilled from the root. Keep composites presentation-only and testable in isolation.

### 3.3 Accessibility as architecture

Accessibility isn't a late pass — it's structural for this audience: every actionable element has an `accessibilityLabel` (Hindi/English), an optional **AudioPlayButton** that speaks the content via `expo-speech`, and screens are usable at large font scales without layout breakage. Build the `useTts()` hook in §hooks and wire it into CropCard/FertiliserCostCard from the start.

---

## 4. Navigation & screen-by-screen breakdown

### 4.1 Navigation map

```
RootNavigator (native-stack)
├─ Splash / bootstrap        (restore session, language, sync status)
├─ AuthStack                 (unauthenticated)
│   ├─ LanguageSelect        (first-run; Hindi default)
│   ├─ PhoneEntry            (enter mobile number)
│   └─ OtpVerify             (enter OTP → tokens + role)
└─ AppTabs (bottom-tabs, authenticated; tabs vary by role — §8)
    ├─ Home                  (today: my fields, quick "New scan", sync/offline banner)
    ├─ Fields                → FieldDetail → FieldMap (Phase 5)
    ├─ Scan  (center FAB)    → PairProbe → CaptureReading (Phase 4) / ManualReading (Phase 3)
    │                         → Recommendation (results)
    ├─ History               → ReadingDetail / RecommendationDetail
    └─ Settings              (language, account, calibration, sync, help/audio)
```

Route params are typed (`navigation/types.ts`). Deep links map to fields/recommendations for future notification support. **Role-based guards** (§8) decide which tabs/screens render.

### 4.2 Screen specifications

Each screen below lists **purpose · key states · main components · offline behaviour**. States always include loading / empty / error / offline — those are designed, not incidental.

**LanguageSelect** — *Purpose:* pick Hindi/English on first run (changeable later). *States:* n/a (local). *Components:* big language cards with native-script labels + audio sample. *Offline:* fully local.

**PhoneEntry / OtpVerify** — *Purpose:* phone+OTP login (§8). *States:* sending OTP, verifying, rate-limited, wrong-code, offline (block with clear message — auth needs network). *Components:* numeric keypad-friendly input, large "Resend" with countdown, error text by `code`. *Offline:* explicitly unavailable, explained kindly.

**Home** — *Purpose:* the launchpad — greet, show my fields, one-tap "New Scan", surface sync/offline status. *States:* loading (skeleton), empty ("Add your first field"), populated, offline banner, pending-sync count. *Components:* SyncBanner, FieldCard list, primary ScanFab, AudioPlayButton on greeting/instructions. *Offline:* reads from local DB; fully functional.

**Fields (list) / FieldDetail** — *Purpose:* manage fields; view a field's latest reading + advice + (Phase 5) boundary/area. *States:* loading/empty/populated/offline; boundary-pending state (GPS not yet available). *Components:* FieldCard, SoilBandBar (latest reading), "Get advice" CTA, FieldMap (Phase 5). *Offline:* cached fields/readings readable; edits queue.

**PairProbe (Phase 4)** — *Purpose:* discover + connect the 7-in-1 probe over BLE. *States:* permission-needed, scanning, found devices, connecting, connected, connect-failed, bluetooth-off. *Components:* device list, big connect buttons, troubleshooting hints (with audio), permission-priming. *Offline:* BLE is local — works with no internet.

**CaptureReading (Phase 4)** — *Purpose:* pull a live sample from the connected probe and confirm it. *States:* reading, parsed (show values with soil bands), sensor-error/out-of-range, GPS-pending notice, save (queues offline). *Components:* live value tiles (N/P/K/pH/EC/moisture/temp), SoilBandBar, provenance note ("NPK not yet calibrated"), Save button. *Offline:* saves to queue; syncs later.

**ManualReading (Phase 3 — first demo)** — *Purpose:* enter soil values by hand (or import) to get advice before hardware exists. *States:* editing, validating (zod mirrors server DTO), submitting, offline-queued. *Components:* react-hook-form fields with units + helper text, sane ranges, season/soil-type pickers, Submit. *Offline:* can save; advice request queues if offline.

**Recommendation (results — the payoff screen)** — *Purpose:* present ranked crops split into Segment A / Segment B with costed fertiliser (§9). *States:* computing, ready, low-confidence warning, stale (based on old reading), offline (show last cached result + note). *Components:* SegmentSection (A/B), CropCard, FertiliserCostCard (bags + ₹), "why this crop" (rationale by code), warnings banner, AudioPlayButton reading the summary aloud. *Offline:* shows cached recommendation for the field; new compute queues.

**History / ReadingDetail / RecommendationDetail** — *Purpose:* browse past readings and advice; compare over time. *States:* loading/empty/populated/offline. *Components:* timeline list, detail cards, trend chart (soil bands over time). *Offline:* fully readable from local DB.

**Settings** — *Purpose:* language, account/logout, **probe calibration status**, **sync status/force-sync**, help (audio-guided). *States:* synced / pending / syncing / error; calibrated vs uncalibrated per device. *Components:* language toggle, CalibrationStatusCard, SyncStatusCard, Help entries with audio. *Offline:* all local except account actions.

### 4.3 The core journey (what must feel effortless)

```
Home → Scan (FAB) → [Pair probe → Capture]  OR  [Manual entry]
     → Get advice → Recommendation (Segment A/B + costed fertiliser, read aloud)
     → (optional) Feedback: "which crop did you choose?"  → feeds retraining
```

Everything else supports this loop. Optimise it ruthlessly; a farmer should reach advice in a handful of large taps, online or off.

---

## 5. State management strategy

Four kinds of state, four homes — mixing them is the usual source of RN state chaos:

| State kind | Tool | Examples | Lifetime |
|---|---|---|---|
| **Server cache** | TanStack Query | fields, readings, recommendations, region config | synced, revalidated |
| **Persistent offline data** | WatermelonDB (SQLite) | local source of truth + write queue | on device until synced |
| **Ephemeral UI/global** | Zustand | session, current language, connectivity, BLE status, selected field | app session |
| **Secrets** | expo-secure-store | refresh token, pairing secret | encrypted, persistent |

### 5.1 How they compose (offline-first read/write)

- **Reads:** screens read via Query hooks whose `queryFn` hits the **local DB first** (so the UI is instant and offline-proof); a background sync updates the DB, and Query re-renders. The network is an *updater of local truth*, never the thing the UI blocks on.
- **Writes (create reading, request advice, feedback):** write to the local DB immediately + enqueue an outbox record with an **idempotency key**; optimistic UI reflects it at once. The sync engine drains the outbox when online, calling the server's idempotent endpoints, and reconciles.
- **Zustand** holds only volatile cross-cutting flags (is-online, ble-connected, active language, session/role). Keep it small; it is not a data store.

### 5.2 Rules

- No server data in Zustand; no ephemeral UI flags in the DB. Tokens only in secure-store.
- Every mutating action is expressed as an outbox operation so the same code path works online and offline.
- Language and role live in Zustand + persisted to MMKV so the app boots into the right state instantly.

---

## 6. Offline-first & BLE integration

### 6.1 The offline sync engine [load-bearing]

This is the app's spine. Design it before building features that write data.

- **Local schema mirrors the server's core tables** (fields, readings, recommendations, feedback) plus an **`outbox`** table: `{ id, op_type, payload, idempotency_key, status, attempts, last_error, created_at }`.
- **Sync loop:** on connectivity regained / app foreground / manual "sync now": (1) **push** — drain outbox oldest-first, POST to idempotent server endpoints (`/v1/readings` batch, recommendations, feedback), mark synced or record error + backoff; (2) **pull** — fetch changes since a cursor and upsert into the local DB.
- **Idempotency:** the key generated on-device is sent as `Idempotency-Key` *and* stored on the row, so retries after a flaky connection never double-write (the server dedupes — server guide §6.1).
- **Conflict policy (v1):** readings are append-only (no conflicts); field edits use last-write-wins with server timestamp authority; recommendations are server-computed (never edited on device). Document this in an ADR.
- **Backoff & visibility:** exponential backoff on failures; the SyncBanner shows pending count and last error in plain language ("3 readings waiting to upload").

### 6.2 BLE integration (Phase 4)

Isolated entirely in `src/ble/` behind clean hooks; screens never touch `ble-plx` directly.

- **Permissions & platform:** Android 12+ needs `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (declared via the ble-plx Expo config plugin in `app.config.ts`); prime the user *before* the system prompt with a plain-language screen. Handle Bluetooth-off and location-services requirements.
- **Lifecycle:** `scan → connect → discover services → subscribe/read characteristic → parse frame → disconnect`. Wrap in a state machine (`idle/scanning/connecting/connected/reading/error`) surfaced to `PairProbe`/`CaptureReading`.
- **Frame parsing [contract]:** the byte/field layout the stick emits is frozen in the server's `docs/ble-protocol.md`. `ble/parseFrame.ts` turns raw frames into a typed reading `{ n_mgkg, p_mgkg, k_mgkg, ph, ec_uscm, moisture_vwc, soil_temp_c, taken_at }`. **Mirror the server's unit suffixes exactly** — no bare `p`. Validate ranges on parse; reject impossible frames with a clear sensor-error state.
- **GPS reality:** firmware currently emits `GPS:PENDING`. The parser sets `location = null` and the UI shows "location pending"; nothing downstream assumes a fix until the firmware fix lands (Phase 4/5). Never fabricate coordinates.
- **Provenance:** every BLE reading is flagged `npk_is_calibrated=false` until the device has a calibration profile; the UI shows the honesty note and passes it through to the advice screen.
- **Testing without hardware:** a **mock BLE adapter** replays recorded frames so you can build and test the whole capture→advice flow at your desk (§14).

---

## 7. API integration plan

### 7.1 Typed client generated from the contract

- A script (`npm run api:gen`) reads the server's `openapi.yaml` and emits `src/api/types.ts` + typed request functions. **Screens import generated types only.** If the server changes a shape, the app fails to compile — exactly what you want across two repos maintained by one person.
- Wrap fetch in an **API client** that injects the access token, sets `Idempotency-Key` on writes, applies timeouts, and maps errors to the server's `{ error: { code, message }, requestId }` envelope.

### 7.2 Query/mutation conventions

- **Queries** (fields, readings, recommendations, region config) go through TanStack Query with sensible `staleTime`, offline persistence, and DB-backed `queryFn` (§5.1). `GET /v1/config/region/:code` is cached aggressively for offline units/price display.
- **Mutations** never call the network directly — they write to the DB + outbox (§6.1). The sync engine performs the actual HTTP with retries.
- **Auth refresh:** a single interceptor refreshes the access token on 401 using the secure-stored refresh token, retries once, and logs out cleanly on refresh failure.
- **Localised errors:** the app maps `error.code` → a Hindi/English message; it never shows the server's raw English string to a farmer.

### 7.3 The recommendation call

`Recommendation` screen triggers `POST /v1/fields/:id/recommendations`; when offline, it queues and shows the last cached result with a "will update when online" note. The response is the server's `RecommendationResult` (Segment A/B + costed fertiliser, server guide §6.4) — rendered per §9. The app performs **no agronomy maths**; it only formats what the server computed (keeps the load-bearing fertiliser logic in one audited place server-side).

---

## 8. Authentication & role-based access

### 8.1 Auth flow (phone + OTP)

Farmers won't manage passwords, so v1 is **phone number → OTP → JWT**:

```
PhoneEntry → POST /v1/auth/otp/request
OtpVerify  → POST /v1/auth/otp/verify → { accessToken, refreshToken, role }
           store refreshToken in secure-store; access token in memory
           Zustand session set; route into AppTabs by role
refresh    → POST /v1/auth/refresh (interceptor, on 401)
logout     → clear secure-store + session; wipe sensitive cached data
```

Design for OTP realities: resend with countdown, autofill where available, rate-limit messaging, and a graceful "no network" block (auth is the one place offline can't work).

### 8.2 Roles & RBAC

Three roles from the server: **farmer** (default), **field agent** (manages multiple farmers/fields, runs scans on their behalf), **admin** (config/monitoring). RBAC is enforced server-side; the client mirrors it for UX:

- A `useRole()` hook + `<RoleGate role="agent">` component conditionally render tabs/actions.
- Farmer sees their fields only; agent gets a farmer-switcher and can create fields/readings for assigned farmers; admin may see config/status screens.
- **Never trust the client for authorization** — the server authorises every request; the client only *hides* what a role shouldn't see.

---

## 9. AI recommendation visualization

This is where the whole system pays off for the farmer. The `Recommendation` screen renders the server's `RecommendationResult` — and the visualisation must be legible to someone who can't read a paragraph.

### 9.1 Segment A vs Segment B — the core mental model

- **Segment A — "Grow now" (green).** Crops the field already suits with no fertiliser. Show as a proud, simple list of **CropCard**s: crop icon + Hindi name + a plain confidence cue (e.g., a 3-dot / leaf meter, not a scary decimal).
- **Segment B — "Worth it with inputs" (amber).** Crops that become viable once you add fertiliser. Each **CropCard** expands into a **FertiliserCostCard**: the products as **bags** (🛍️ ×2 Urea, ×1 DAP) + total **₹ cost**, because bags and rupees are what a farmer actually buys and budgets.

Colour does the heavy lifting (green = go, amber = go-if-you-invest), consistent with the design tokens (§3.1).

### 9.2 Making numbers human

- **Fertiliser as bags first, kg second.** Lead with "2 bags of Urea (100 kg)", not "100 kg N-equivalent". The server already returns whole 50 kg bags and rupee cost (server guide §6.4) — the app just formats them with icons and localised currency (₹, Indian digit grouping).
- **Soil bands, not raw values.** Show N/P/K/pH/EC as **Low / Medium / High** bars (SoilBandBar) with colour, with the raw value available on tap for the curious. This is honest about a proxy sensor and instantly readable.
- **Confidence without false precision.** Never show "0.6432". Use a small ordinal cue (Good / Fair) derived from the calibrated score, and only when the backend's calibration supports it.
- **"Why this crop"** uses the server's `rationale_code` mapped to a short localised phrase + icon ("Low nitrogen → add Urea"), never a raw model dump.

### 9.3 Read it aloud

Every recommendation has an **AudioPlayButton** that speaks a Hindi summary via `expo-speech`: *"आपके खेत के लिए: अभी उगाएँ — चना। खाद के साथ — गेहूं, दो बोरी यूरिया, लागत ₹3450।"* This is the single most important accessibility feature for the target user; build it into the results screen from day one.

### 9.4 Honesty & provenance

If the result carries warnings (e.g., uncalibrated probe, advice based on an old reading), show a calm, plain-language banner — amber, not alarming. The app must never present proxy-sensor advice as lab-grade certainty; surfacing the caveat *builds* trust rather than eroding it.

### 9.5 Trends (History)

In `RecommendationDetail`/`History`, a simple time-series of soil bands (victory-native) shows how a field changes across scans — valuable once the pilot accumulates repeat readings. Keep it optional and lightweight; the hero is always the current advice.

---

## 10. Error handling & resilience

For a field app on flaky networks, error states are core UX, not edge cases:

- **Global error boundary** around the navigator → a friendly recovery screen (with audio) instead of a white crash; report to Sentry.
- **Four designed states per data surface:** loading (skeletons, not spinners where possible), empty (with a clear next action), error (localised by `code`, with retry), offline (banner + cached content). No screen is allowed to have an undefined state.
- **Network awareness:** a persistent, unobtrusive **offline banner** and a **pending-sync count**; actions that require network (auth, fresh compute) explain themselves when offline rather than failing silently.
- **BLE errors** get their own plain-language handling (bluetooth off, permission denied, out of range, sensor gave a bad frame) with recovery hints and audio, isolated in `ble/` error mapping.
- **Optimistic-write rollback:** if a queued write ultimately fails server validation, surface it in the SyncBanner with a way to view/fix/retry — never lose a farmer's captured reading quietly.
- **Localised, code-driven messages:** all user-facing errors come from the i18n bundle keyed by `error.code`; English server strings never reach the UI.

---

## 11. Performance optimization

Target device = **low-end Android** with limited RAM/CPU. Design for it, don't discover it at pilot:

- **Hermes engine on** (Expo default) for faster startup + lower memory.
- **List virtualisation** (FlashList/FlatList) for fields, history, device lists; never map large arrays into views.
- **Render discipline:** memoise composites (CropCard, FertiliserCostCard), stable keys, avoid inline object/style creation in hot lists; keep Zustand slices narrow so unrelated updates don't re-render.
- **Startup:** lazy-load heavy screens (maps, charts) via navigation; keep the auth→home path lean so the app opens fast on cold start.
- **Assets:** compress crop imagery, ship appropriately sized icons, subset the Devanagari font to needed glyphs to cut bundle size.
- **BLE & battery:** time-box scans, stop scanning once connected, disconnect when done; never scan in the background unprompted.
- **Data frugality:** cache region config and imagery; sync deltas not full sets; batch reading uploads.
- **Measure on real hardware:** profile with a cheap physical Android device (not just a fast emulator) each phase; watch cold-start, list scroll, and memory during BLE.

---

## 12. Internationalization & accessibility

- **i18n:** `react-i18next` with `hi` (default) and `en` bundles; ICU pluralisation; **localised numbers/currency/units** (₹ with Indian grouping, kg, bags). Every string is a key — no hardcoded text. Crop names carry both scripts.
- **Devanagari rendering:** bundle and register a proper Devanagari font; verify conjuncts and matras on a real device (emulator fonts lie). This is a Phase-0 checklist item, not a polish task.
- **Voice/TTS:** `useTts()` hook wraps `expo-speech` (Hindi voice) and is attached to greetings, instructions, and — critically — the recommendation summary (§9.3). Where TTS quality is poor, fall back to bundled recorded audio clips for key phrases.
- **Low-literacy patterns:** icon+label pairs everywhere, colour-coded meaning (green/amber/red), imagery for crops, minimal text density, and a consistent, predictable layout so the app is learnable by repetition.
- **Standard a11y:** `accessibilityLabel`/`accessibilityRole` on all controls, large dynamic-type support, sufficient contrast, ≥48 dp targets. These also make automated E2E (Maestro) more robust.

---

## 13. Feature implementation order

Sequenced to reach the first full demo fast (manual flow, Phase 3), then close the hardware loop. Aligns with the master roadmap (server guide §2). Each step ends with something you can show.

**Phase 0 — Foundations (parallel with server P0/P1)**

- Scaffold Expo + Dev Client + EAS; TypeScript strict; NativeWind; navigation shell.
- Build the **design system** (`ui/`) and Devanagari font + i18n bootstrap — verify Hindi on a real device.
- Stand up the **offline DB** (WatermelonDB schema + outbox) and Zustand session/connectivity slices.
- Wire `api:gen` from the server's `openapi.yaml` (even if stubbed).
- *DoD:* app boots, switches Hindi/English, renders the design system, has an empty local DB + sync scaffold.

**Phase 2/3 — Auth + manual-input recommendation (first demo)**

- OTP auth flow + secure token storage + refresh interceptor + role gating.
- Fields: list/create/detail (offline-backed).
- **ManualReading** form (zod mirrors server DTO) → `POST /recommendations`.
- **Recommendation** screen: Segment A/B, FertiliserCostCard, soil bands, audio summary, warnings.
- Error/empty/offline states across these screens.
- *DoD:* **first end-to-end demo** — enter soil values → costed crop+fertiliser advice, read aloud, works offline-then-sync. No hardware.

**Phase 4 — BLE + hardware capture**

- `ble/` wrapper + permissions priming + PairProbe + CaptureReading against the frozen frame contract.
- Mock BLE adapter for deskside testing; then real probe.
- Offline reading queue → idempotent `/v1/readings` batch sync.
- *DoD:* real probe reading → advice, online and offline.

**Phase 5 — Field map & geo**

- FieldMap (react-native-maps/MapLibre) rendering PostGIS boundary + area; boundary-pending state until GPS firmware lands.
- *DoD:* a walked field shows boundary + hectares.

**Phase 6 — Pilot polish**

- Feedback capture ("which crop did you choose / how did it go?"), History trends, calibration-status UX, Sentry + analytics, EAS Update channel for the pilot.
- Real-device performance pass; usability test with a few farmers.
- *DoD:* pilot-ready build in farmers' hands, feeding feedback to the server.

**Phase 7+ — Advanced AI surfaces**

- Soil-health view (ships with v1), then chatbot (RAG), disease camera capture, personalised ranking — each gated on the server-side feature being live.

---

## 14. Testing approach

- **Unit (Jest):** pure logic — frame parsing (`ble/parseFrame`), unit/currency formatters, sync/outbox reducer, i18n key coverage, error-code → message mapping.
- **Component (React Native Testing Library):** the composites that carry meaning — CropCard, FertiliserCostCard, SoilBandBar, SegmentSection — including their loading/empty/error/offline states and accessibility labels.
- **Offline & sync tests:** simulate offline → queue writes → reconnect → assert idempotent drain and DB reconciliation. This is the highest-value test suite for a field app.
- **BLE with a mock adapter:** replay recorded/fabricated frames (valid, out-of-range, malformed, GPS-pending) and assert correct parsing + error states — no hardware needed in CI.
- **E2E (Maestro):** the core journey (login → manual/scan → advice) and the offline variant, run on a real/low-end device profile. Maestro's simplicity suits a solo builder better than heavy Detox setup.
- **Contract test:** CI regenerates types from the latest `openapi.yaml`; a breaking server change fails the client build — the cross-repo safety net.
- **Manual device matrix:** at least one cheap physical Android device; test Hindi rendering, sunlight contrast, and BLE each phase.

**DoD per phase:** unit+component green, offline/sync tests green, the phase's journey passes on Maestro, and it was demoed on real hardware.

---

## 15. Deployment strategy

- **EAS Build profiles (`eas.json`):** `development` (Dev Client, includes BLE native modules), `preview` (internal APK for pilot testers), `production` (AAB for Play Store). No local Xcode/Gradle babysitting.
- **Distribution:** internal distribution / a closed Play Store track for the Chambal pilot cohort; graduate to production track after P6.
- **OTA updates (EAS Update):** JS-only fixes pushed to a pilot channel without a store round-trip — pair each native/store build with an update channel; document what *must* be a full rebuild (native/permission/BLE plugin changes) vs an OTA-able JS change.
- **Versioning:** semver + auto-incremented build numbers via EAS; keep app version ↔ server API version compatibility notes in `docs/adr/`.
- **Observability:** Sentry (JS + native) for crashes; lightweight analytics on the core funnel (scan → advice → feedback) to learn how farmers actually use it during the pilot.
- **Store readiness:** privacy policy + data-safety form (you handle farmer PII + location), Hindi store listing, permission-usage strings (Bluetooth/location) written for real reviewers.
- **Staged rollout:** ship to a small cohort, watch crash-free rate and the funnel, then widen. OTA lets you fix fast mid-pilot.

---

## 16. Quick reference

**Key commands**
```
npx expo start --dev-client        # run against the Dev Client
npm run api:gen                    # regenerate types from server openapi.yaml
eas build --profile development    # Dev Client build (includes BLE)
eas build --profile preview        # internal pilot APK
eas update --branch pilot          # push OTA JS update to pilot devices
npm test / maestro test e2e/       # unit+component / E2E
```

**State homes:** server cache → TanStack Query · offline truth + outbox → WatermelonDB · volatile flags → Zustand · secrets → expo-secure-store.

**Non-negotiables**

1. **Offline-first:** UI reads local DB; writes go through the idempotent outbox; the network only updates local truth.
2. **The server owns contracts:** types are generated from `openapi.yaml`; the app does **no** agronomy maths and never fabricates GPS.
3. **Low-literacy-first:** icons + colour (green=grow now, amber=needs input) + **Hindi audio** on every key surface; fertiliser shown as **bags + ₹**.
4. **Unit safety mirrors the server:** reading fields are unit-suffixed (`n_mgkg`…); a bare `p` is a bug here too.

**First milestone to aim for:** the Phase 3 manual-input demo — soil values in, costed crop+fertiliser advice out, read aloud in Hindi, working offline. Everything else builds on that.

---

*End of `CLIENT_DEVELOPMENT_GUIDE.md`. Companion: `SERVER_DEVELOPMENT_GUIDE.md` in `aaroh-server`. Domain source of truth: `Aaroh_Master_Documentation.docx`.*




