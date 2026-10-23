# Aaroh Client — Design Direction (from `app_assets/`)

**Source:** `app_assets/designpdf.pdf` (9 mobile mockups, 432×934), `logo.jpeg`, `farmer_img.jpeg`, `other.jpeg`
**Analysed:** 2026-08-27 · **Status:** driving M1 (design system)
**Standing instruction from mishr:** treat the design as a **strong reference, not pixel law**. Keep the aesthetic direction and feel; improve layouts, components, and UX patterns where sensible.

---

## 1. What the reference actually contains

Nine screens, all phone-shaped, English-only copy (except the logo), Canva-produced:

| # | Screen | Phase relevance |
|---|---|---|
| 1 | **Login** — Google / Phone / Email + password | M3 (partial — see §5.2) |
| 2 | **Verify Your Number** — OTP boxes + resend countdown | M3 |
| 3 | **Create your account** — name/email/password + strength meter | Not in v1 server scope (§5.2) |
| 4 | **Connect Your Device** — BLE, "3 Simple Steps", scan CTA | **Phase 4**, not Phase 3 |
| 5 | **Field Setup** — 3-step wizard: field size (acres), point spacing, point count | M4 (partial — §5.4) |
| 6 | **Dashboard** — 7 soil metric cards + field-fertility heat map + bottom tabs | M4/M6 (adapted) |
| 7 | **Nav drawer** — Marketplace / Account / "Grow with AgroPulse" + dark mode + language | Mostly out of scope |
| 8 | **My Profile** — profile card + settings rows + logout | Light version in M7 |
| 9 | **Buy Raw Materials** — marketplace listing | Out of v1 scope |

**The single most important observation: the reference contains no recommendation/advice screen.** There is no Segment A / Segment B, no costed fertiliser card, no bags-and-₹ display anywhere in the nine pages. That screen — M6, the entire payoff of Phase 3 — has to be designed from scratch **in this visual language**. The dashboard's soil-metric cards and the fertility heat map are the closest reference, and they give us the card vocabulary to build it from.

---

## 2. Colour tokens (sampled from the mockups)

Extracted by pixel-frequency analysis across all 9 pages.

| Token | Hex | Where it appears in the reference |
|---|---|---|
| `primary` (deep forest) | **#22421A** | Primary buttons ("Login", "Verify OTP", "Continue", "Scan & Connect"), major headings |
| `primary-alt` (brand green) | **#1F5A2A** | Section headings ("Verify Your Number", "Field Setup"), link text, icon strokes |
| `accent` (logo orange) | **#FE7F02** | The Devanagari "एग्रो" in the wordmark; reserved for brand + highlights |
| `success` / grow-now | **#187F21** → **#31A72F** | "Strong" strength bar, connected dot, most-fertile zone |
| `warning` / needs-input | **#F2A93B**-range (from "Medium" bar) | Moderate-fertility zone, caution states |
| `danger` | **#B80C26** | "Weak" bar, least-fertile zone, logout text |
| `danger-surface` | **#FFE7E7** | Logout row background |
| `tint-surface` (light green) | **#F2FFE2** / **#F2F8EE** | Helper/info strips ("Make sure your stick is powered on"), icon circles |
| `info` | **#689FF8** | The ⓘ affordance on metric cards |
| `border` | **#DFDFDF** | Card outlines, input borders |
| `text-muted` | **#A6A6A6** | Input placeholders, sub-labels |
| `surface` | **#FFFFFF** | Cards, sheets (76% of all pixels — the design is airy and white-dominant) |

**How this reconciles with the guide's semantic requirement.** `CLIENT_DEVELOPMENT_GUIDE.md` §3.1 mandates green = grow now, amber = viable with input, red = avoid/error. The reference already uses exactly that triad in its password-strength meter and fertility legend, so the semantic mapping is native to the design, not imposed on it:

- **Segment A (grow now)** → `success` green family
- **Segment B (worth it with inputs)** → `warning` amber family
- **Avoid / error / destructive** → `danger` red family
- `primary` deep-green stays for chrome and primary actions so it never competes with the A/B semantics.

---

## 3. Typography

The PDF embeds **Agrandir** (display), **CanvaSans** (body), **Poppins**, **Montserrat-Bold**, and **NotoSansDevanagari-Regular**. Agrandir and CanvaSans are proprietary Canva faces and cannot ship in the app.

**Substitution decision: Poppins as the primary family, Noto Sans Devanagari alongside it.**

- **Poppins** is already embedded in the reference, is geometric and friendly (very close to Agrandir's feel), is free via Google Fonts, and — critically — was designed by Indian Type Foundry **with a Devanagari companion**. One family covers both scripts with a consistent voice.
- **Noto Sans Devanagari** (also already in the PDF) ships as the Hindi fallback so complex conjuncts (क्ष, त्र, ज्ञ) and matras render correctly. Guide §12 flags emulator fonts as unreliable for this — but since we're testing on the Android emulator, bundling the font explicitly (rather than relying on system fallback) is what makes rendering deterministic.

Scale follows the guide's ≥16–18sp floor (farmers read at arm's length in sunlight): display 28–32, h1 24, h2 20, body 17, caption 14 — with bold weights carrying hierarchy, as the reference does.

---

## 4. Component vocabulary (what to build in M1)

The reference is highly consistent, which makes the primitive set easy to extract:

- **Card** — white, ~14–16 radius, hairline #DFDFDF border, generous internal padding. The universal container: metric tiles, step rows, settings rows, form sheets.
- **Primary button** — full-width, `primary` #22421A fill, white bold label, pill-ish radius (~26), often with a leading icon. Meets the guide's 48dp floor comfortably.
- **Secondary button** — white fill, thin border, dark label + icon (the "Login with Phone" / "Login with Email" pair).
- **Input** — white, rounded, hairline border, **leading icon inside the field**, muted placeholder, optional trailing affordance (eye toggle, unit suffix like `acres` / `meters`).
- **Metric tile** — small card: label on top, pastel-green circular icon badge, **large bold value + small unit**, sub-label beneath, ⓘ in the corner. This is the pattern the recommendation screen's soil bands and the M5 form review should reuse.
- **Numbered step row** — green circular index + icon + title/subtitle + right-hand illustration. Perfect for the M5 form's guidance and M7 help.
- **Info strip** — light-green `tint-surface` rounded strip with a ✓ icon and one line of plain guidance. This is exactly the vehicle for the guide's honesty/provenance notes ("NPK not yet calibrated") and for `warnings[]` from `RecommendationResult`.
- **Hero + sheet layout** — illustration up top, white rounded sheet overlapping from below carrying the interactive content. The signature of the three auth screens; we keep it for the whole AuthStack.
- **Brand header** — centred wordmark, optionally with a status line ("● Connected") beneath.
- **Bottom tabs** — 5 icon+label tabs (reference: Dashboard / History / Field Setup / Buy / Settings).
- **Language chip** — globe + "EN ▾" top-right. Promotes the guide's Hindi-default requirement to a persistent, discoverable control.

---

## 5. Reference ↔ reality register

Where the design and the built server contract diverge, and what we do about it. **The server owns the contract** (guide §0), so these resolve toward the API — but the *look* stays faithful to the reference.

### 5.1 Brand identity — RESOLVED: **AgroPulse**
The reference brands the product **"एग्रो Pulse" / "AgroPulse"**, tagline *"Smart Farming. Better Future."*, and calls the hardware "the AgroPulse Stick". Every project document, both repos, and the master documentation call it **Aaroh (आरोह)**.

**Decision (mishr, 2026-08-27): the app ships as AgroPulse**, using the supplied logo as-is. **"Aaroh" remains the internal project and repository name only** — it stays in docs, repo names, and the server's package identifiers, but no user-facing surface says "Aaroh". App name `AgroPulse`, slug `agropulse`, Android package `com.agropulse.app`, tagline "Smart Farming. Better Future." available as an i18n string.

### 5.2 Authentication — reference is broader than the server
The reference offers Google OAuth, email+password, phone+OTP, and a full create-account screen with a password-strength meter. The built server implements **phone + OTP only** (`/v1/auth/otp/request` → `/verify`), creates the farmer on first login (so no separate signup screen is needed), and has **no password-login route** — that was deliberately deferred in Phase 2 and is still flagged as an open decision.

**Resolution:** M3 implements **phone + OTP**, styled with the reference's hero+sheet layout and its "Login with Phone" visual treatment. Google/email/password are **deferred** — they need server work first (OAuth flow, password hashing, a login route). No create-account screen: first OTP login *is* signup.

**OTP length:** the reference shows **4** boxes; the server accepts `^\d{4,8}$` and the dev code is **6** digits (`000000`). We build **6** boxes to match the real server, keeping the reference's box-input styling.

### 5.3 EC units — a real discrepancy, worth flagging
The reference dashboard shows EC as **1.28 dS/m**. The API field is **`ec_uscm` — µS/cm**. I checked what the model was actually trained on: in `master_crop_training_data_v2.csv` the `ec` column runs **30 → 7263, median 337**. That is unambiguously **µS/cm**, so the server's field name and the model agree, and the reference's dS/m is a display-unit choice (1 dS/m = 1000 µS/cm; 1.28 dS/m = 1280 µS/cm — a realistic soil value).

**Separate finding, server-side:** the Phase 2 checkpoint's sample curl sends `"ec_uscm": 0.3`. In µS/cm that is ~distilled water and sits **1000× below the training minimum of 30** — it was almost certainly meant as 0.3 dS/m. It doesn't corrupt the fertiliser maths (EC isn't in the agronomy config; it only feeds the ML ranker), but any crop ranking produced from that sample was computed on an out-of-distribution EC. Worth correcting in the server's sample/docs, and worth making the app's input hard to get wrong. **Decision (mishr, 2026-08-27): the manual-entry form accepts dS/m** — matching the reference, Soil Health Cards, and lab reports — and the app multiplies **×1000 to send `ec_uscm`**. The input soft-warns outside **0.03–7.3 dS/m** (the training range, 30–7263 µS/cm expressed in dS/m) so a 1000× slip cannot pass silently. The unit conversion lives in `lib/units.ts` with a unit test pinning `1.28 dS/m → 1280 µS/cm`. This is presentation-layer conversion, not agronomy maths, so it respects the "no agronomy in the client" rule.

### 5.4 Field setup — reference is a hardware flow
The reference's Field Setup asks for **area in acres**, **distance between sampling points (meters)**, and **number of points** — a multi-point probe-walking flow that belongs to Phase 4/5 (BLE + geospatial). The API's field model takes `name`, **`area_ha`** (hectares), and `region_code`.

**Resolution:** M4 builds field create as **name + area** only, borrowing the reference's card + unit-suffixed input styling and keeping its stepper affordance for later. Point spacing/count are **deferred to Phase 4**. **Decision (mishr, 2026-08-27): the farmer types acres** (as the reference shows, and as MP smallholders think), and the app converts **×0.404686 to hectares** before sending `area_ha`, showing the hectare equivalent as live helper text. Conversion lives in `lib/units.ts` with a unit test. Bigha was considered and deferred — its value varies by region, so it needs a pinned local factor before it can be trustworthy.

### 5.5 Out of Phase 3 scope entirely
Marketplace ("Buy Raw Materials", "My Orders", "Reorder"), seller/industry onboarding, messaging, dark mode, notification preferences, and the BLE "Connect Your Device" flow. The bottom tab bar in Phase 3 therefore carries **Home · Fields · History · Settings** — the reference's "Buy" tab is omitted rather than stubbed, so we don't ship a dead end. Nothing here is rejected, just sequenced.

### 5.6 Language
All reference copy is English; the guide mandates **Hindi-default**, bilingual. We keep the reference's layouts but every string is an i18n key from M1, and the language chip is persistent. Hindi labels are the default render — so text lengths must be tested in Devanagari, which is typically wider.

---

## 6. Logo asset note

`logo.jpeg` is 724×345 on an **opaque near-white background (#F2F2F2)**, not transparent. On white surfaces it will show a visible plate. For M1 I'll key out the background to produce a transparent PNG at the sizes we need (header wordmark, splash, app icon). A vector (SVG/PDF) original would be materially better for crispness across densities — worth requesting from whoever produced the Canva file. The "Pulse" script and the pulse-line flourish are part of the wordmark and should always be used as the supplied artwork, never re-typed.

---

## 7. What M1 will therefore produce

`src/ui/` design tokens (the §2 palette with semantic aliases, the §3 type scale, an 8-pt spacing scale, radii, shadows), the Poppins + Noto Sans Devanagari font registration, the i18n bootstrap (hi default / en), and the §4 primitive set — `Text`, `Button`, `SecondaryButton`, `Card`, `Input`, `MetricTile`, `StepRow`, `InfoStrip`, `BrandHeader`, `LanguageChip` — exercised on a temporary kitchen-sink screen so you can see and judge them in one place before they get wired into real screens.

---

*Companion documents: `PHASE_3_ROADMAP.md` (milestones), `CLIENT_DEVELOPMENT_GUIDE.md` (architecture).*
