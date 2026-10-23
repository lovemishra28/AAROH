# Aaroh — Client Phase 3 Implementation Roadmap

**Phase 3: Manual-input recommendation demo — the first real end-to-end demo, no hardware.**

**Repo:** `aaroh-client` · **Companion:** `CLIENT_DEVELOPMENT_GUIDE.md` (this repo), `SERVER_DEVELOPMENT_GUIDE.md` + `api/openapi.yaml` (aaroh-server)
**Version:** 1.0 · **Date:** 2026-08-27 · **Status:** M0–M8 built & type-clean (2026-08-28); awaiting emulator verification against live server. See `PHASE_3_TEST_AND_RELEASE.md` for the test plan + release tracker. Open item: Hindi TTS is opt-in (needs `expo-speech` install + rebuild).
**Authority:** The server owns every contract. Every API shape below is taken from `aaroh-server/api/openapi.yaml` (v1.0.0). If this doc and the OpenAPI ever disagree, the OpenAPI wins.

---

## 0. What Phase 3 is (and what it is not)

**Goal:** A farmer (or we, on demo day) opens the app, logs in with a phone number, creates a field, **types soil values in by hand**, taps "Get advice", and sees **costed crop + fertiliser advice** — grow-now crops and "worth-it-with-inputs" crops with fertiliser in whole 50 kg bags and ₹ — read aloud in Hindi, and still usable with no signal.

**In scope:** app scaffold, design system, Hindi/English i18n, OTP auth, fields, the manual-reading form, the recommendation results screen, audio summary, and a scoped offline path for the two writes this flow makes.

**Out of scope (later phases):** BLE probe pairing / live capture (Phase 4), field map & geospatial (Phase 5), pilot polish + feedback analytics (Phase 6), advanced AI surfaces (Phase 7+). We build **no** BLE, **no** GPS, and the app does **no** agronomy maths — it only formats what the server computed.

**Prerequisite (assumed satisfied):** the Phase 2 server is verified and answering — auth, fields, readings, and `POST /v1/fields/:id/recommendations` all return correct responses (confirmed via Postman). If integration surfaces a server gap, we fix it in `aaroh-server`; the bulk of new code lives here.

---

## 1. The end-to-end flow we're building

```
LanguageSelect → PhoneEntry → OtpVerify        (auth: phone + dev OTP 000000 → tokens + role)
     → Home (my fields, sync/offline banner)
     → Fields: create "Test plot" with area_ha  (area is required — see §4)
     → FieldDetail → "Enter reading by hand"
     → ManualReading form (N,P,K,pH,EC,moisture) → submit
     → "Get advice"
     → Recommendation (Segment A grow-now + Segment B costed fertiliser, read aloud)
```

**Critical data-flow detail (load-bearing):** the recommendation endpoint does **not** accept raw soil numbers in its body. It reads them from a **persisted reading** on the field. So the manual-input flow is **two sequential calls**:

1. `POST /v1/readings` with `source: "manual"` and the six soil values → creates the reading on the field.
2. `POST /v1/fields/:id/recommendations` with an empty body → the server uses that field's latest reading + the field's `area_ha` + default agro-context, runs the ML ranker + deterministic agronomy engine, persists the result, and returns it.

The app then renders the returned `RecommendationResult`. That is the whole demo.

---

## 2. Screen structure & navigation (Phase 3 subset)

Full map is in `CLIENT_DEVELOPMENT_GUIDE.md` §4; Phase 3 lights up this subset:

```
RootNavigator (native-stack)
├─ Splash / bootstrap            restore session + language, decide route
├─ AuthStack (unauthenticated)
│   ├─ LanguageSelect            Hindi default, changeable later
│   ├─ PhoneEntry                enter mobile number
│   └─ OtpVerify                 enter code → tokens + role
└─ AppTabs (authenticated)
    ├─ Home                      my fields, "New reading" CTA, sync/offline banner
    ├─ Fields  → FieldDetail     list/create; detail shows latest reading + "Get advice"
    │              └─ ManualReading      hand-enter soil values (Phase 3 entry point)
    │              └─ Recommendation     the payoff screen (Segment A/B + costed fertiliser)
    ├─ History  (light)          past readings & recommendations, offline-readable
    └─ Settings (light)          language toggle, account/logout, sync status
```

**Every data screen designs four states: loading / empty / error / offline.** No screen is allowed an undefined state (guide §10). The BLE-only screens (`PairProbe`, `CaptureReading`) are **not** built in Phase 3.

Each screen's purpose, states, and components are specified in `CLIENT_DEVELOPMENT_GUIDE.md` §4.2; this roadmap sequences *when* we build each in §8.

---

## 3. State management & data flow

Four kinds of state, four homes (guide §5):

| State kind | Tool | Phase 3 examples |
|---|---|---|
| Server cache | **TanStack Query** | fields, field detail, recommendations, region config |
| Persistent offline data | **WatermelonDB (SQLite)** | local cache of fields/readings/recommendations + the **outbox** write queue |
| Ephemeral / global UI | **Zustand** | session (role, logged-in), active language, connectivity (online/offline) |
| Secrets | **expo-secure-store** | refresh token |

**Read path:** screens read via Query hooks that read the local DB first (instant, offline-proof); a background sync updates the DB and Query re-renders. **Write path:** the two Phase 3 writes (create reading, request recommendation) go to the local DB + an **outbox** row with an on-device `idempotency_key`; the sync engine drains the outbox against the server's idempotent endpoints when online. Access token lives in memory; refresh token in secure-store; language/role also mirrored to fast KV so the app boots into the right state.

> **Phase 3 pragmatism (see §9):** we build the *online* happy path first and add the offline outbox as the final Phase 3 milestone, because the offline sync engine is the single heaviest piece and the demo is provable before it lands. The Phase 3 DoD still requires offline-then-sync to work.

---

## 4. API integration points (authoritative — from `openapi.yaml` v1.0.0)

Base URL (dev): `http://localhost:3000`. All routes except `/v1/health` and `/v1/auth/*` require `Authorization: Bearer <access_token>`. Errors always come back as `{ error: { code, message, details }, requestId }` — the app maps `error.code` to a localized Hindi/English message and never shows the raw English string.

**Auth (guide §8)**

| Call | Body | Returns |
|---|---|---|
| `POST /v1/auth/otp/request` | `{ phone }` | `{ sent, expires_in_s, dev_code }` — in dev, `dev_code` is `"000000"` |
| `POST /v1/auth/otp/verify` | `{ phone, code }` | `{ farmer, access_token, refresh_token, token_type, expires_in, role }` |
| `POST /v1/auth/refresh` | `{ refresh_token }` | new `TokenBundle` (rotating) |
| `GET /v1/me` | — | `{ farmer }` |

`phone` pattern: `^\+?\d{10,15}$`. `role ∈ { farmer, agent, admin }`. Refresh on 401 via a single interceptor; retry once; clean logout on refresh failure.

**Fields**

| Call | Body | Returns |
|---|---|---|
| `GET /v1/fields` | — | `{ fields: Field[] }` |
| `POST /v1/fields` | `{ name, area_ha, region_code? }` (default `chambal`) | `201 { field }` |
| `GET /v1/fields/:id` | — | `{ field, latest_reading | null }` |
| `GET /v1/fields/:id/readings` | — | `{ readings: Reading[] }` |

> **`area_ha` matters:** the recommendation refuses with `422 AREA_REQUIRED` if the field has no area. The create-field form must capture area in hectares.

**Readings (the manual entry write)**

`POST /v1/readings` — accepts a single reading or `{ readings: [...] }`; **idempotent by `idempotency_key`**.
Manual-flow body:

```json
{
  "field_id": "<uuid>",
  "source": "manual",
  "n_mgkg": 100, "p_mgkg": 8, "k_mgkg": 90,
  "ph": 7.2, "ec_uscm": 0.3, "moisture_vwc": 20,
  "soil_temp_c": 24,                     // optional
  "idempotency_key": "<uuid-from-device>"
}
```

Returns `{ readings, created_count, duplicate_count }`. **NPK are elemental mg/kg (probe basis), never oxide.** Unit-suffixed field names are mandatory — a bare `p` is a bug here too.

**The six required soil fields.** A reading must carry all six of the following or the recommendation returns `422 READING_INCOMPLETE` with `details.missing` naming the gaps. This is the exact list the server's `recommendations.service.ts` enforces:

`n_mgkg` · `p_mgkg` · `k_mgkg` · `ph` · `ec_uscm` · `moisture_vwc`

`soil_temp_c` is optional (temperature is included only if measured). `humidity`, `rainfall`, `soil_type`, and `season` are **not** entered on the reading — the server fills them from region defaults and they can optionally be overridden on the recommendation call. **The ManualReading zod schema mirrors exactly these six required fields** (plus optional soil temp).

**Recommendation (the money path — the payoff)**

`POST /v1/fields/:id/recommendations` — body optional; **an empty body `{}` is valid** and uses the field's latest reading, the field's area, and default context. Optional overrides: `{ reading_id?, area_ha?, season?, soil_type?, humidity?, rainfall?, budget_hint? }`.

- `201 { recommendation }` on success (persisted).
- `422` → `READING_INCOMPLETE` (with `missing`) · `NO_READING` · `AREA_REQUIRED`.
- `502 / 503 / 504` → AI gateway errors (`AI_UNREACHABLE`, `AI_TIMEOUT`, `AI_SERVICE_ERROR`) — show a calm "couldn't reach the advisor, try again" state, not a crash.

`GET /v1/fields/:id/recommendations` → `{ recommendations: [...] }` (newest first) for History.

**`RecommendationResult` — the payload the results screen renders (guide §9):**

```
model_version, agronomy_version, region_code, area_ha
segment_a: [ { crop, crop_hi, score, rationale_code } ]                 // "grow now" (green)
segment_b: [ { crop, crop_hi, score, rationale_code,
               fertiliser: {
                 products: [ { name, bags_50kg, kg, supplies } ],       // e.g. DAP ×1, Urea ×2
                 nutrient_gap_kgha: { n_kgha, p2o5_kgha, k2o_kgha },
                 cost_inr                                               // total ₹
               } } ]                                                     // "worth it with inputs" (amber)
warnings: [ string ]                                                    // e.g. uncalibrated probe / stale reading
```

Render Segment A as proud grow-now `CropCard`s (green); Segment B as `CropCard`s that expand into a `FertiliserCostCard` (amber) showing **bags first, kg second, then ₹**. Show `rationale_code` as a short localized phrase, not a raw code. Never show a raw score decimal — use an ordinal cue (Good/Fair).

**Region config (optional for the demo, cache aggressively)**

`GET /v1/config/region/:code` → `{ config }` (bag size, rounding, products, per-crop `crop_hi` + RDF, prices). Not on the Phase 3 critical path — the `RecommendationResult` already carries the crop Hindi names, product names, bags, and cost — but useful later for offline unit/price display.

**Feedback (Phase 6, listed for completeness)**

`POST /v1/feedback` `{ recommendation_id, chosen_crop?, actually_planted?, outcome?, lab_test? }`.

---

## 5. UI / design approach — decision

**You asked me to choose. Decision: build functionality-first on a real design-token foundation, then do a dedicated visual-polish milestone against your screenshots.** Concretely:

- **We do not** hand-build pixel-perfect screens from the screenshots while simultaneously wiring auth, navigation, the API, and the results rendering. Doing everything at once multiplies risk and makes each step hard to verify — the opposite of the step-by-step discipline we agreed on.
- **We do** set up the NativeWind design system early (Milestone 1) — semantic colours (green = grow now, amber = needs input, red = avoid/error), typography scale, spacing, and the Devanagari font. Functional screens use these tokens with simple, clean layouts, so the "functional" version is **not throwaway** — polishing it later is refinement, not a rewrite.
- **Screenshots:** please share them whenever you're ready. I'll use them to **seed the palette and typography in Milestone 1** (so early screens already trend toward your design), and then a later **visual-polish milestone** matches each screen to the reference. If the screenshots are detailed enough, that polish pass can be substantial; if not, we iterate.

Net effect: you see a working end-to-end demo sooner, the design isn't lost (it's sequenced), and each milestone stays independently verifiable.

---

## 6. Server: how to run it during client development

This mirrors exactly how you verified Phase 2 (checkpoint §6): **database + AI in Docker, the API on the host.** Run these in `aaroh-server`.

```bash
# ── Terminal 1: datastore + AI service (Docker) ───────────────────
cd AAROH-Server
docker compose up --build db ai
#   db → localhost:5433 (Postgres 16 + PostGIS)   ai → localhost:8000 (must serve crop-ranker@1.0.0)

# ── Terminal 2: the API on the host ───────────────────────────────
cd AAROH-Server/api
npm install                    # first time only
npm run migrate:up             # apply v1 schema  (only needed once per fresh DB volume)
npm run seed                   # seed Chambal region config  (once per fresh DB)
npm run dev                    # API on http://localhost:3000  (hot-reload)
```

Sanity checks before touching the app:
- `http://localhost:3000/v1/health` → `{"status":"ok","dependencies":{"database":"up","ai_service":"up"}}`
- If `ai_service` shows down, the AI container may not carry the trained model — run the AI service on the host (uvicorn, as in Block 1) and point `AI_SERVICE_URL` at it. The money path only needs `http://localhost:8000/recommend` to answer.

Notes: the DB port `5433` and the Docker/native-Postgres collision are a **server-side** concern only — **the app never talks to Postgres directly**, only to the API on `:3000`. `docker compose down -v` wipes the DB volume (you'd re-run migrate + seed).

---

## 7. Environment & networking setup (app → server)

The one thing that trips up every RN dev on day one: `localhost` inside the app is **the phone/emulator, not your PC**. The API base URL is an env value (`app.config.ts` → `extra`, read via `expo-constants`), so we set it per target:

| Run target | API base URL to use | Notes |
|---|---|---|
| **Android emulator** (AVD) | `http://10.0.2.2:3000` | `10.0.2.2` is the emulator's alias for the host machine |
| **Physical Android device** (Expo Dev Client, same Wi-Fi) | `http://<your-PC-LAN-IP>:3000` | e.g. `http://192.168.1.20:3000`; allow inbound TCP 3000 through Windows Firewall |
| iOS simulator (not our focus) | `http://localhost:3000` | Android-first for this project |

**Recommended demo target:** a **physical low-end Android phone** via an Expo **Dev Client** build — it's the truest demo and the guide mandates real-device testing (Hindi rendering + sunlight contrast can only be judged there). The emulator is fine for fast iteration on the earliest milestones. We'll confirm your preferred target at Milestone 0.

---

## 8. Milestone plan (strictly sequential)

Rules of engagement, per our agreed workflow: **one milestone at a time. I build it, then I tell you exactly (a) what's done, (b) how to test it, (c) what success looks like. You verify and clear your doubts. I ask permission before starting the next milestone.** Each milestone below already states its test + success criteria (its Definition of Done).

Milestones map to the guide's §13 "Phase 0" + "Phase 2/3" work, split finer for verifiability.

---

### M0 — Project scaffold & guardrails
**Build:** Initialize Expo (Dev Client) + TypeScript strict + NativeWind + React Navigation. Create the `src/` feature-first folder structure (§2 of the guide). One placeholder Home screen. `app.config.ts` with the API base URL wired via `expo-constants`.
**How to test:** `npx expo start` → open on your chosen target (device/emulator); the placeholder screen renders; a NativeWind-styled element shows styling; `npm run typecheck` is clean.
**Success (DoD):** app boots on the real target, TypeScript strict compiles, NativeWind renders, navigation shell mounts.

### M1 — Design system + i18n + Hindi font
**Build:** `ui/` tokens (semantic green/amber/red, type scale ≥16–18sp, 8-pt spacing), Devanagari font (Noto Sans Devanagari) registered via config plugin, `i18n/` (react-i18next; `hi` default + `en`), and the primitive components (Text, Button, Card, Chip, Badge, Icon). A temporary "kitchen sink" screen to view them. *(Screenshots, if provided, seed the palette/type here.)*
**How to test:** open the kitchen-sink screen; toggle language hi↔en; verify Devanagari conjuncts render correctly on a **real device** (क्ष, त्र, ज्ञ) — emulator fonts can lie.
**Success (DoD):** primitives render consistently, language toggle flips all sample strings, Devanagari renders correctly on hardware.

### M2 — API client + typed contract + health check
**Build:** typed API client wrapping `fetch` (injects bearer token, sets `Idempotency-Key` on writes, timeouts, maps the `{error:{code,message}}` envelope). Generate/mirror types from `openapi.yaml` into `src/api/types.ts`. TanStack Query provider. A dev-only "ping" that calls `GET /v1/health`.
**How to test:** with the server running (§6), trigger the ping; the app displays the health JSON (`status: ok`).
**Success (DoD):** the app reaches the running server from your target device and health returns ok — the networking (§7) is proven end-to-end.

### M3 — Auth: OTP login, session, secure storage, refresh
**Build:** `LanguageSelect` → `PhoneEntry` → `OtpVerify`. `POST /v1/auth/otp/request` then `/verify`; store refresh token in secure-store, access token in memory; Zustand session (role); 401 refresh interceptor; logout. Route into AppTabs by role.
**How to test:** enter a phone number → request code → the dev code `000000` logs you in → app lands on Home; force-quit and reopen → session restored (refresh); `GET /v1/me` returns your farmer; logout returns to auth.
**Success (DoD):** a persisted authenticated session against the real server, with working refresh and logout.

### M4 — Fields: list, create, detail
**Build:** `Home` (field list + "New reading" CTA + offline banner placeholder), `Fields` list (`GET /v1/fields`), create-field form (`POST /v1/fields` — **captures name + area_ha**), `FieldDetail` (`GET /v1/fields/:id` → field + latest_reading, with an empty "no reading yet" state).
**How to test:** create "Test plot", 1.0 ha; it appears in the list; open it → detail shows the field with a "no reading yet" empty state.
**Success (DoD):** a field is created server-side, listed, and its detail renders with the correct empty state.

### M5 — ManualReading form → create reading
**Build:** the `ManualReading` screen — `react-hook-form` + zod mirroring the **six required fields** (`n_mgkg, p_mgkg, k_mgkg, ph, ec_uscm, moisture_vwc`) + optional `soil_temp_c`, each with unit label, helper text, and sane range validation. Submit → `POST /v1/readings` (`source:"manual"`, `field_id`, on-device `idempotency_key`). Prefill with the golden sample (N100/P8/K90/pH7.2/EC0.3/moisture20) for fast demoing.
**How to test:** from the field, open ManualReading, submit the values; `FieldDetail` now shows a `latest_reading`; re-submitting the same idempotency key does not duplicate.
**Success (DoD):** a manual reading persists on the field with correct units and validation; field detail reflects it.

### M6 — Recommendation request + results screen (the payoff)
**Build:** "Get advice" triggers `POST /v1/fields/:id/recommendations` (empty body → latest reading). Render `RecommendationResult`: `SegmentSection` A (green grow-now `CropCard`s) and B (amber `CropCard` → `FertiliserCostCard` with **bags first, then ₹**), `SoilBandBar` for the reading, a `rationale_code`→phrase mapping, and a warnings banner. Handle `422` (READING_INCOMPLETE/NO_READING/AREA_REQUIRED) and `503` (AI_UNREACHABLE) as designed states.
**How to test:** tap "Get advice" on the field with the reading → see Segment A crops and Segment B crops with fertiliser in whole 50 kg bags + a ₹ total. **Cross-check the app against the server for the *same* reading** — run those identical values through the §6 curl money path and confirm the app renders the same `segment_a` / `segment_b` / `cost_inr`. (For reference, the server's locked golden case is Wheat with all-Low soil @1.0 ha, dose 150/75/50 → DAP×3 + Urea×5 + MOP×2 = ₹8,930 — that specific input, not the prefilled sample.)
**Success (DoD):** end-to-end advice renders in the app, the numbers match the server exactly, and warnings/error states display correctly. **This is the core of the demo.**

### M7 — Audio summary (Hindi TTS) + full state polish
**Build:** `useTts()` hook over `expo-speech` (Hindi) + `AudioPlayButton` on the recommendation summary (speaks a plain-language Hindi sentence). Fill in loading (skeletons), empty, error (localized by `code`), and offline states across the auth→advice path. Global error boundary.
**How to test:** tap the audio button → hear the Hindi advice summary; walk each screen's four states.
**Success (DoD):** the recommendation is read aloud in Hindi; no screen has an undefined state.

### M8 — Scoped offline path + demo hardening (closes Phase 3)
**Build:** WatermelonDB local cache for fields/readings/recommendations + an `outbox` table for the two writes (create reading, request recommendation) with idempotency keys; connectivity detection in Zustand; `SyncBanner` (pending count + last error); drain-on-reconnect. Reads served from the local DB first.
**How to test:** enable airplane mode → enter a reading and request advice (both queue, UI reflects them) → show the last cached advice with a "will update when online" note → disable airplane mode → outbox drains, fresh advice appears, banner clears.
**Success (DoD):** the full manual-input demo works **offline-then-sync**, no double-writes. **Phase 3 DoD met.**

---

## 9. Deliberate deviations from the client guide (with rationale)

1. **Offline DB is built last (M8), not in "Phase 0."** The guide's §13 stands up the offline DB up front. We defer it to the end of Phase 3 so the visible money-path demo (M0–M7) is provable sooner and each step shows something. The guide's Phase 3 DoD ("works offline-then-sync") is still honoured — it's just the final Phase 3 milestone. *If you'd rather build the offline spine first, say so and I'll reorder.*
2. **Offline scope is narrowed to the two Phase 3 writes.** We don't build the full BLE-batch sync engine now (no BLE until Phase 4). M8 handles exactly `create reading` + `request recommendation`; the engine expands in Phase 4 when probe readings arrive in volume.
3. **Expo Dev Client from the start.** Even though Phase 3 has no BLE, `expo-secure-store` and (in M8) WatermelonDB are native modules, so a Dev Client build is needed anyway. Expo Go can accelerate M0–M4 if we want a quick look before the first Dev Client build.

---

## 10. Phase 3 Definition of Done

Phase 3 is complete when, on a real Android device against the running server:

1. A user logs in by phone + OTP and the session persists across restarts.
2. They create a field with an area, hand-enter the six soil values, and get back **costed crop + fertiliser advice** — Segment A grow-now and Segment B with fertiliser in **50 kg bags + ₹** — with the numbers **matching the server**.
3. The advice is **read aloud in Hindi**, and the UI is bilingual with correct Devanagari.
4. The whole flow works **offline** (queued) and **syncs** on reconnect without duplicating.
5. Every screen has designed loading / empty / error / offline states.

No hardware involved. That demo is the foundation Phase 4 (BLE) bolts onto.

---

*End of Phase 3 roadmap. We proceed one milestone at a time, verifying each before the next.*
