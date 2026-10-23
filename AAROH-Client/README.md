# AgroPulse — mobile client

React Native (Expo) app for the Aaroh soil-advisory system. The farmer enters or measures
soil values, and the app returns **costed** crop and fertiliser advice — quantities in
50 kg bags and a rupee total.

> `Aaroh` is the internal project name. The user-facing brand is **AgroPulse**; it should
> never say "Aaroh" anywhere in the UI.

Planning documents live alongside this file: `CLIENT_DEVELOPMENT_GUIDE.md` (stack and
architecture), `PHASE_3_ROADMAP.md` (milestones M0–M8), `DESIGN_DIRECTION.md` (visual
language derived from `app_assets/`).

---

## 1. First-time setup

Run these from `C:\AAROH-Client`. The dependency versions are deliberately **not**
pinned in `package.json` — `npx expo install` resolves the versions that match the
installed Expo SDK, which is safer than hand-picking them.

```bash
# 1. Expo itself (this also creates the lockfile)
npm install expo

# 2. Runtime + navigation + styling
npx expo install react react-native expo-status-bar expo-constants expo-dev-client
npx expo install react-native-safe-area-context react-native-screens
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs

# 3. Styling toolchain — NativeWind v4 requires Tailwind v3, NOT v4
npm install nativewind
npm install --save-dev tailwindcss@^3.4.0 prettier

# 4. Fonts, icons, i18n, state (M1)
npx expo install expo-font expo-splash-screen expo-localization @expo/vector-icons
npm install @expo-google-fonts/poppins @expo-google-fonts/noto-sans-devanagari
npm install i18next react-i18next zustand

# 5. Data + session (M2 / M3)
npm install @tanstack/react-query
npx expo install expo-secure-store

# 6. TypeScript + Babel
npx expo install --save-dev typescript @types/react @babel/core
```

Then confirm the types compile:

```bash
npm run typecheck
```

## 2. Running on the Android emulator

Start the emulator from Android Studio first (Device Manager → play button), then:

```bash
npx expo run:android
```

This performs a local Gradle build, installs a **development build** of AgroPulse on the
emulator, and starts Metro. The first build takes several minutes; afterwards use:

```bash
npm start
```

and press `a` to open the already-installed build.

If the native build hits Android-toolchain trouble (JDK version, SDK licences), you can
unblock yourself for milestones M0–M2 with Expo Go instead — nothing in the app uses a
custom native module yet:

```bash
npm run start:go
```

Expo Go stops being viable from M8 (WatermelonDB) and Phase 4 (BLE) onward, so the
development build is the path we actually want.

## 3. Talking to the API

The Aaroh server must be running at `http://localhost:3000` on this PC. Inside an
emulator, `localhost` means the emulator itself, so the app targets **`10.0.2.2:3000`** —
the emulator's alias for the host's loopback interface.

| Target | API base URL |
| --- | --- |
| Android emulator (default) | `http://10.0.2.2:3000` |
| Physical Android device on the same Wi-Fi | `http://<PC-LAN-IP>:3000` |
| iOS simulator | `http://localhost:3000` |

Override by copying `.env.example` to `.env` and setting `EXPO_PUBLIC_API_BASE_URL`.
The resolved value is read through `src/lib/env.ts` and displayed on the M0 screen, so
you can always see what the app thinks it is pointing at.

### Physical Android phone or emulator without re-editing config

Use the project helper scripts so you do not have to keep hand-editing `.env` or
`app.config.ts`:

```powershell
# emulator target
npm run start:emulator

# phone target (uses the PC's LAN IPv4 automatically)
npm run phone

# choose target explicitly
npm run start:device -- -Target emulator
npm run start:device -- -Target phone
```

The `start:device` script auto-detects a connected emulator or device when possible, and
falls back to the emulator default (`http://10.0.2.2:3000`) when needed. The phone
workflow sets `EXPO_PUBLIC_API_BASE_URL` to the machine's LAN IP for that Expo session,
so the app can connect from a real Android phone without permanently changing the repo.

If the phone still cannot connect, allow Node/Docker Desktop through Windows Firewall
on the Private network and verify `http://<PC-IP>:3000/v1/health` from the phone's
browser. The API server must be running on the PC (`docker compose up` from the
server repository, or `npm run dev` inside `Aaroh-Server/api`).

### Bluetooth permission troubleshooting

The full GATT contract, frame format, and a step-by-step nRF Connect setup for faking the
stick with a second phone are in [`BLE_PROTOCOL.md`](./BLE_PROTOCOL.md) — including a
checklist for the case where the device picker shows nothing.

USB debugging does not control Bluetooth permission. On Android 12+, the app needs
the **Nearby devices** permission; on Android 11 and earlier it also needs location
permission because Android requires it for BLE scanning. The app requests the
appropriate permission when scanning starts. If the permission was denied, enable it
in **Settings → Apps → AgroPulse → Permissions**, then try scanning again.

Because BLE uses a native module, rebuild the development client after changing
`app.config.ts` or installing the BLE config plugin:

```powershell
npx expo prebuild --clean --platform android
npx expo run:android
```

`--clean` is important here because the native `android` folder may already have
been generated before the Bluetooth permissions were configured. It regenerates
the manifest and then installs a fresh development client.

## 4. Project layout

```
index.ts                  registerRootComponent entry
app.config.ts             Expo config — branding, icons, extra.apiBaseUrl
tailwind.config.js        design tokens (brand / grow / invest / avoid)
global.css                Tailwind directives, imported by src/App.tsx
src/
  App.tsx                 providers + navigator
  navigation/             RootNavigator, route param types
  features/               one folder per feature; screens live with their logic
    auth/ fields/ readings/ recommendations/ history/ settings/ home/
  components/             shared presentational components
  api/                    typed client + hooks per endpoint group
  lib/                    env, units, formatting, pure helpers
  theme/                  raw token values for non-className consumers
  i18n/                   translation resources (hi default, en fallback)
  store/                  Zustand slices for ephemeral global state
  hooks/                  cross-feature hooks
assets/images/            logo, icons, splash, hero imagery
app_assets/               source design material (not bundled)
```

## 5. Authentication providers

The auth landing screen (`src/features/auth/AuthScreen.tsx`) offers three paths. All three are
backed by real server routes; every one of them resolves to the identical
`TokenBundle & { farmer }` shape, which is why `authStore.setSession()` never branches on which
door was used.

| Path | Routes | Configuration needed |
| --- | --- | --- |
| Phone + OTP | `/v1/auth/otp/request` → `/otp/verify` | none (dev stub logs the code) |
| Email + password | `/v1/auth/email/register`, `/email/login` | none |
| Email one-time code | `/v1/auth/email/otp/request` → `/email/otp/verify` | none (server logs the code) |
| Forgotten password | `/v1/auth/password/forgot` → `/password/reset` | none |
| Google Sign-In | `/v1/auth/google` | **yes** — a Google Cloud client ID |

A farmer holds whichever identifiers their sign-up produced, so `Farmer.phone` and
`Farmer.email` are both `string | null`. Settings shows only the rows that exist rather than
printing a dash for a door the account never used.

Signing out calls `POST /v1/auth/logout` to revoke the refresh token server-side, then clears
secure storage and the native Google session. All three steps are best-effort: being offline
must not trap a farmer in a session they asked to leave.

### Google Sign-In setup

Uses `@react-native-google-signin/google-signin` (Google's own current recommendation —
not the deprecated `expo-auth-session/providers/google`). It's a native module, so it does
**not** work in Expo Go.

1. Create an **OAuth 2.0 Web application** client ID in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   Set it as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in **`.env`** — not `.env.example`, which
   Expo never reads — **and** the same value as `GOOGLE_WEB_CLIENT_ID` in
   `AAROH-Server/api/.env`. The server requires the ID token's audience to equal its own
   client ID, so a mismatch is rejected — that check is what stops a token minted for
   another app from signing someone in.
2. Also register an **Android** OAuth client (same Cloud project) with package name
   `com.agropulse.app` and your debug/release SHA-1 fingerprint
   (`cd android && ./gradlew signingReport`), so Google recognises the app. Its client ID is
   never put in any config — Google matches by package + fingerprint while the token stays
   addressed to the web client.
3. Rebuild so the native module links in: `npx expo run:android`. After changing any
   `EXPO_PUBLIC_*` value, restart the bundler with `npx expo start --clear` — they are inlined
   into the JS bundle at build time.

Step-by-step console walkthrough, including the consent screen and test users:
`AAROH-Server/README.md` → *Authentication providers → "Continue with Google"*.

Each way this can fail has its own message, because they need different fixes:

| On-screen message | Cause | Fix |
| --- | --- | --- |
| "Google sign-in is not set up yet" | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` missing from the bundle | put it in `.env`, then `npx expo start --clear` |
| "…not set up on the server yet" (503) | server has no `GOOGLE_WEB_CLIENT_ID` | set it in `AAROH-Server/api/.env`, restart the API |
| "This app build is not registered with Google" | native `DEVELOPER_ERROR` — no Android OAuth client, wrong SHA-1, or a webClientId from another project | re-check step 2, then rebuild |
| "Could not sign in with Google" | anything else, including a rejected token (401) | read the `[google-signin] failed` warning Metro logs in dev |

The last row is the reason that dev-only `console.warn` exists: Google's native errors carry
the code that identifies the misconfiguration, and it is unrecoverable once flattened into a
sentence for the farmer.

### Email codes and password reset

Nothing to configure. The server's default `MAIL_TRANSPORT=console` writes the message to its
log instead of sending it, and outside production the response carries `dev_code`, so the
verify and reset flows are testable without a mail provider. Set the `SMTP_*` block on the
server to send real email.

`src/api/auth.ts` exposes `requestEmailOtp`, `verifyEmailOtp`, `forgotPassword` and
`resetPassword` against these routes. The current screens use password sign-in only; the
passwordless-code and reset flows are wired at the API layer and still need UI.

### Phone sign-up name capture

The Sign Up + Phone form collects a name, but `/v1/auth/otp/verify` has no name field, so the
name cannot ride along with it. After verification the app makes a best-effort
`PATCH /v1/me { name }` call (`updateMe()` in `src/api/auth.ts`). It stays best-effort on
purpose: a failed name save must never block a sign-in that already succeeded.

## 6. Non-negotiables

- **Units carry their name.** `n_mgkg` is elemental mg/kg; `p2o5_kgha` is on the oxide
  basis. A bare `p` is a bug. The farmer types acres and dS/m; conversion to `area_ha`
  and `ec_uscm` happens once, in `src/lib/units.ts`.
- **The app does no agronomy maths.** Quantities, doses and costs come from the server's
  deterministic engine. The client formats `RecommendationResult` and nothing more.
- **Bags before kilograms.** Fertiliser is bought in 50 kg bags, so that is the primary
  number; kg is the secondary detail.
- **Hindi is the default language**, English the fallback. Type never drops below 16sp
  and touch targets never below 48dp.
