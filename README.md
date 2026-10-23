# AgroPulse (Aaroh)

AgroPulse is an offline-first soil advisory platform for smallholder farmers in
the Gwalior/Chambal region of Madhya Pradesh, India. It combines a handheld
ESP32 soil-sensing stick, a Hindi-first Android application, a versioned
backend, and an AI/agronomy service.

The product turns a soil reading into practical, costed advice:

- which crops are suitable for the field;
- how much fertiliser is needed for the selected crop;
- how many 50 kg bags that represents; and
- an estimated rupee cost.

The user-facing product is named **AgroPulse**. **Aaroh** is the internal
project and repository name.

> **Project status:** The repository contains working client, API, AI, database,
> and BLE/firmware foundations. The roadmap still describes an incremental
> path to a field pilot. Hardware calibration, production deployment, and
> region-wide agronomic validation are not implied by the existence of the
> software.

## Contents

- [How the system works](#how-the-system-works)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configure the environment](#configure-the-environment)
- [Run the mobile app](#run-the-mobile-app)
- [Run the API and AI services](#run-the-api-and-ai-services)
- [Database migrations](#database-migrations)
- [Hardware and BLE](#hardware-and-ble)
- [AI and agronomy](#ai-and-agronomy)
- [API overview](#api-overview)
- [Testing and quality checks](#testing-and-quality-checks)
- [Important domain rules](#important-domain-rules)
- [Documentation map](#documentation-map)
- [Troubleshooting](#troubleshooting)
- [Security and production notes](#security-and-production-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## How the system works

```text
ESP32 sensing stick
  └─ BLE readings and offline sync
       ↓
AgroPulse mobile app
  ├─ Hindi/English field workflow
  ├─ local state and queued readings
  └─ authenticated API requests
       ↓
Node.js / Express API (public product boundary)
  ├─ authentication and farmer accounts
  ├─ fields, devices, readings, feedback
  ├─ PostgreSQL/PostGIS persistence
  └─ private requests to the AI service
       ↓
Python / FastAPI AI service
  ├─ probabilistic crop ranking
  └─ deterministic fertiliser and cost calculation
```

The mobile application talks to the Node API only. The Python service is an
internal service and should not be exposed directly to mobile clients.

The most important design boundary is that the two recommendation engines do
different jobs:

1. The **crop ranker** estimates which crops suit the soil and field conditions.
2. The **deterministic agronomy engine** calculates fertiliser quantities and
   costs using explicit rules, prices, units, and regional configuration.

The ranker does not calculate money, and the fertiliser engine does not pretend
to be a machine-learning model.

## Repository structure

```text
C:\AAROH
├── README.md                         # This project overview
├── AAROH-Client\                     # AgroPulse React Native mobile app
│   ├── src\                          # Screens, features, API, BLE, state, i18n
│   ├── scripts\                      # Device and frame-development helpers
│   ├── app.config.ts                 # Expo configuration and runtime API URL
│   ├── .env.example                  # Client environment template
│   ├── BLE_PROTOCOL.md                # Mobile ↔ ESP32 wire contract
│   └── package.json
├── AAROH-Server\                     # Backend repository
│   ├── api\                          # Node.js/Express public API
│   ├── ai\                           # Python/FastAPI inference and ML package
│   ├── database\migrations\          # PostgreSQL/PostGIS migrations
│   ├── docs\                         # ADRs and API conventions
│   ├── docker-compose.yml            # Local db + AI + API stack
│   └── .env.example                  # Compose environment template
└── Hardware\esp_code\                # ESP32 Arduino firmware
    └── esp_code.ino
```

Generated dependencies and build output (`node_modules`, virtual environments,
Android builds, caches, and model artifacts) are intentionally not source
code and should not be copied into documentation or committed as new files.

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Mobile | React Native, Expo Dev Client, TypeScript | Farmer-facing Android application |
| Mobile UI | NativeWind, React Navigation, Zustand, TanStack Query | Styling, navigation, local state, server state |
| Mobile integrations | `react-native-ble-plx`, Secure Store, i18next, Expo Speech | Probe connectivity, credentials, localization, accessibility |
| Public API | Node.js, Express, TypeScript, Zod | Versioned client-facing API and business boundary |
| Database | PostgreSQL 16 + PostGIS 3.4 | Relational and geospatial persistence |
| AI service | Python 3.11+, FastAPI, NumPy, pandas, ONNX Runtime | Private inference and agronomy service |
| Training | LightGBM/XGBoost, scikit-learn, Optuna, ONNX | Crop-ranker training and model export |
| Firmware | ESP32 Arduino, BLE, LittleFS, NPK/RS485, GPS, RTC, OLED | Soil measurement and offline device storage |

## Prerequisites

Install the following before starting local development:

- Git
- Docker Desktop with Docker Compose
- Node.js 22 or newer
- Python 3.11 or newer
- Android Studio and an Android SDK/device for the mobile app
- Arduino IDE (or an equivalent ESP32 toolchain) for firmware work

The backend's Docker setup runs PostgreSQL for you; a separate PostgreSQL
installation is not required.

## Quick start

### 1. Start the backend stack

From `C:\AAROH\AAROH-Server` in PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The services are published at:

| Service | URL | What it provides |
|---|---|---|
| Public API | `http://localhost:3000` | Mobile-facing API |
| API health | `http://localhost:3000/v1/health` | API, database, and AI dependency status |
| AI service | `http://localhost:8000` | Private inference service |
| AI health | `http://localhost:8000/health` | AI liveness and model status |
| PostgreSQL | `localhost:5433` | Host-side database connection |

The database is published on port `5433` by default to avoid collisions with a
native PostgreSQL installation using `5432`. Inside Docker, the API connects to
the database using the Compose service name and internal port.

### 2. Apply database migrations

In a second PowerShell window:

```powershell
Set-Location C:\AAROH\AAROH-Server\api
npm install
$env:DATABASE_URL = "postgres://aaroh:aaroh@localhost:5433/aaroh"
npm run migrate:up
```

### 3. Start the mobile app

In another PowerShell window:

```powershell
Set-Location C:\AAROH\AAROH-Client
npm install
Copy-Item .env.example .env
npx expo run:android
```

The default Android emulator URL is `http://10.0.2.2:3000`, which maps the
emulator's `localhost` to the development computer. For a physical phone, use
the helper workflow:

```powershell
npm run phone
```

The phone and computer must be on the same network, and Windows Firewall must
allow the API and Metro/Node traffic on the private network.

## Configure the environment

Do not commit real credentials. Copy each template to a local `.env` file:

| File | Consumer | Main settings |
|---|---|---|
| `AAROH-Server\.env` | Docker Compose | Database container, ports, API/AI wiring, auth forwarding |
| `AAROH-Server\api\.env` | Host-run API and migrations | Database URL, JWT, Google, mail, OTP settings |
| `AAROH-Client\.env` | Expo configuration | API base URL and optional Google client IDs |

Useful local settings include:

```dotenv
# AAROH-Client/.env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

```dotenv
# AAROH-Server/api/.env
DATABASE_URL=postgres://aaroh:aaroh@localhost:5433/aaroh
AI_SERVICE_URL=http://localhost:8000
JWT_SECRET=replace-this-with-a-long-local-secret
MAIL_TRANSPORT=console
```

The default development authentication setup is intentionally self-contained:
phone and email OTP codes are logged, and email messages use the console
transport. Google Sign-In requires a Google Cloud OAuth web client ID on both
the server and the mobile configuration. SMTP is required only when actual
email delivery is needed.

## Run the mobile app

From `AAROH-Client`:

```powershell
npm run start:go       # Expo Go; useful only for flows without native BLE
npm start              # Expo Dev Client
npm run start:emulator # Configure the API for an Android emulator
npm run start:phone    # Configure the API for a physical phone
npm run typecheck      # TypeScript validation
```

BLE requires a native development build; Expo Go cannot load the BLE native
module. Rebuild after native configuration changes:

```powershell
npx expo prebuild --clean --platform android
npx expo run:android
```

The client is designed around Hindi-first, bilingual field use, large touch
targets, offline-friendly data handling, secure token storage, and explicit
uncertainty/provenance rather than false precision.

## Run the API and AI services

### API

From `AAROH-Server\api`:

```powershell
npm install
npm run dev        # watch mode
npm run typecheck
npm test
npm run lint
```

The API is versioned under `/v1` and owns the public contract, authentication,
validation, persistence, and calls to the private AI service.

### AI service

For the containerized service, use `docker compose up --build` from
`AAROH-Server`.

For local Python development:

```powershell
Set-Location C:\AAROH\AAROH-Server\ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[train,dev]"
pytest
ruff check .
```

The AI service exposes:

- `GET /health` — service and active-model status;
- `POST /predict` — ranked crops only;
- `POST /recommend` — ranked crops plus deterministic fertiliser/cost advice;
- `POST /reload` — reload the active registered model without restarting.

The AI service returns `503` for prediction/recommendation when no active model
is available rather than serving an unverified guess.

## Database migrations

Migrations live in `AAROH-Server\database\migrations` and are run with
`node-pg-migrate` from the API package:

```powershell
Set-Location C:\AAROH\AAROH-Server\api
npm run migrate:up
npm run migrate:down
npm run migrate:create -- my-migration-name
```

Run migrations deliberately; starting Compose does not automatically modify
the schema. To remove the local database volume and all local data:

```powershell
docker compose down -v
```

Use that command only when intentionally resetting local development data.

## Hardware and BLE

The firmware is for an ESP32 Dev Module and integrates:

- NPK over RS485/Modbus;
- pH, EC, moisture, and temperature readings;
- GPS and RTC;
- OLED status output;
- LittleFS offline reading storage; and
- BLE synchronization with the mobile app.

The BLE flow is:

```text
connect → STATUS(count) → app requests SYNC → frames stream →
SYNC_DONE → app sends ACK → device clears synced frames
```

Reading frames are newline-terminated ASCII key/value records. `ID`, `N`, `P`,
and `K` are the core fields; N/P/K are elemental mg/kg values. The service,
characteristic UUIDs, frame format, permissions, sync commands, MTU behavior,
and nRF Connect test procedure are documented in
[`AAROH-Client\BLE_PROTOCOL.md`](./AAROH-Client/BLE_PROTOCOL.md).

For firmware setup, select the **ESP32 Dev Module** board and the
`Huge APP (3MB No OTA/1MB SPIFFS)` partition scheme. The BLE library is
provided by the ESP32 Arduino core; the firmware also requires U8g2, RTClib,
and TinyGPSPlus.

## AI and agronomy

The training data and model registry are under `AAROH-Server\ai`:

```text
ai\datasets\raw\       immutable source datasets and crop ranges
ai\models\registry\    active/registered model metadata
ai\models\artifacts\   frozen model versions and evaluation reports
ai\src\aaroh_ai\
  data\                loading and validation
  features\            shared train/serve feature pipeline
  evaluation\          ranking metrics, golden cases, reports
  training\             configs, training, gates, registry
  inference\            FastAPI and CLI serving
  services\agronomy\   deterministic regional recommendations
```

The crop ranker is evaluated as a ranking system using soft crop suitability
labels, primarily NDCG@3, KL divergence, calibration, and top-k coverage. A
single sampled hard label is not treated as the whole truth.

Training a model:

```powershell
Set-Location C:\AAROH\AAROH-Server\ai
.\.venv\Scripts\Activate.ps1
python -m aaroh_ai.training.train --config src\aaroh_ai\training\configs\crop_ranker_softprob_v1.yaml
```

Training, evaluation, registration, activation gates, and ONNX export are
described in [`AAROH-Server\ai\README.md`](./AAROH-Server/ai/README.md).

## API overview

The public API is documented in [`AAROH-Server\api\openapi.yaml`](./AAROH-Server/api/openapi.yaml).
The main resource groups are:

| Group | Examples |
|---|---|
| Health | `GET /v1/health` |
| Authentication | OTP, email/password, email OTP, password reset, Google, logout |
| Farmer profile | `GET/PATCH /v1/me` |
| Devices | Register and manage sensing sticks |
| Fields | Create and manage fields and boundaries |
| Readings | Upload and retrieve manual/BLE readings |
| Recommendations | Generate costed advice for a field |
| Configuration | Region and advisory configuration |
| Feedback | Capture farmer/field-agent feedback |

All non-public resource routes require authentication. The API uses a short-lived
access token and rotating opaque refresh tokens; signing out revokes the
refresh token server-side.

## Testing and quality checks

Run checks for the component you changed rather than rebuilding everything:

```powershell
# Mobile
Set-Location C:\AAROH\AAROH-Client
npm run typecheck
npm run verify:frames

# API
Set-Location C:\AAROH\AAROH-Server\api
npm run typecheck
npm test
npm run lint

# AI
Set-Location C:\AAROH\AAROH-Server\ai
.\.venv\Scripts\Activate.ps1
pytest
ruff check .
```

The mobile frame verifier and the AI golden tests are particularly important
because they protect the BLE wire contract and the model/agronomy behavior.

## Important domain rules

These rules are architectural and domain constraints, not optional formatting:

1. **Keep the two engines separate.** ML ranks crops; deterministic code
   calculates fertiliser and price.
2. **Preserve units in names and schemas.** For example, distinguish
   `n_mgkg`, `p_mgkg`, `k_mgkg` from `n_kgha`, `p2o5_kgha`, and `k2o_kgha`.
3. **Apply field area after prediction.** Hectares scale quantities and costs;
   they are not model features.
4. **Treat sensor NPK as a proxy until calibrated.** Do not present
   uncalibrated readings with laboratory-level certainty.
5. **Keep region configuration explicit.** v1 targets Gwalior/Chambal; prices,
   crop bands, and agronomic rules must be region-aware.
6. **Be honest when dependencies are unavailable.** Health and recommendation
   paths should report degraded/unavailable states instead of silently
   returning fabricated advice.
7. **Preserve offline behavior.** The field workflow must tolerate patchy
   connectivity and sync queued readings safely.

## Documentation map

- Mobile setup and architecture:
  [`AAROH-Client\README.md`](./AAROH-Client/README.md)
- Mobile implementation guide:
  [`AAROH-Client\CLIENT_DEVELOPMENT_GUIDE.md`](./AAROH-Client/CLIENT_DEVELOPMENT_GUIDE.md)
- BLE contract and test setup:
  [`AAROH-Client\BLE_PROTOCOL.md`](./AAROH-Client/BLE_PROTOCOL.md)
- Server setup and architecture:
  [`AAROH-Server\README.md`](./AAROH-Server/README.md)
- Server development plan:
  [`AAROH-Server\SERVER_DEVELOPMENT_GUIDE.md`](./AAROH-Server/SERVER_DEVELOPMENT_GUIDE.md)
- AI training and model registry:
  [`AAROH-Server\ai\README.md`](./AAROH-Server/ai/README.md)
- API contract:
  [`AAROH-Server\api\openapi.yaml`](./AAROH-Server/api/openapi.yaml)
- Architecture decisions:
  [`AAROH-Server\docs\adr\`](./AAROH-Server/docs/adr/)
- Hardware source:
  [`Hardware\esp_code\esp_code.ino`](./Hardware/esp_code/esp_code.ino)

## Troubleshooting

### API health is degraded

Check the API, database, and AI logs:

```powershell
docker compose ps
docker compose logs api
docker compose logs ai
docker compose logs db
```

Confirm that migrations have run and that port `5433` is not occupied by
another process. The API can be alive while reporting a degraded dependency.

### The Android app cannot reach the API

- Emulator: use `http://10.0.2.2:3000`, not `localhost`.
- Physical phone: use the computer's LAN IP and keep both devices on the same
  Wi-Fi network.
- Test `http://<host>:3000/v1/health` from the phone browser.
- Allow Docker Desktop/Node through Windows Firewall on the Private network.

### BLE devices do not appear

Use an Expo development build, not Expo Go. Enable Nearby devices and, on
older Android versions, Location permission and Location services. If the
native project predates BLE configuration, run:

```powershell
npx expo prebuild --clean --platform android
npx expo run:android
```

For a complete checklist and a two-phone nRF Connect simulation, see
[`AAROH-Client\BLE_PROTOCOL.md`](./AAROH-Client/BLE_PROTOCOL.md).

### Google Sign-In fails

Check both sides: `GOOGLE_WEB_CLIENT_ID` in the API environment and
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the client environment. The API boot log
reports which authentication providers are configured.

### No recommendations are returned

Check `http://localhost:8000/health`. If `model_loaded` is false, register or
activate a valid model artifact before calling `/predict` or `/recommend`.
The service intentionally returns `503` rather than returning an unverified
recommendation.

## Security and production notes

This repository is configured for local development by default. Before any
production or field-pilot deployment:

- replace the development JWT secret;
- use a managed secret store and never commit `.env` files;
- configure HTTPS and secure mobile API transport;
- configure a real SMTP provider and verify sender/domain settings;
- configure Google OAuth with production package/bundle identifiers;
- restrict database and AI-service network access;
- review OTP rate limits, logging, token rotation, and retention;
- calibrate sensors against laboratory measurements; and
- have regional agronomic advice reviewed before presenting it as field guidance.

The default console mail transport and development OTP behavior are convenient
for local testing but are not production delivery mechanisms.

## Roadmap

The intended delivery sequence is:

1. Foundations, schemas, migrations, and local tooling.
2. AI trustworthiness: train, evaluate, gate, and freeze the crop ranker.
3. Backend core: API, authentication, database, inference, and agronomy.
4. Manual-input mobile flow: first end-to-end recommendation demo.
5. Hardware loop: BLE ingest, offline queue, temperature/GPS fixes.
6. Geospatial features: field clustering, boundaries, and maps.
7. Pilot hardening: monitoring, feedback, sensor calibration, and retraining.
8. Later capabilities such as yield prediction, disease vision, and
   personalization.

The detailed phase plan is maintained in the server and client development
guides linked above.

## Contributing

1. Read this README and the component guide for the area you are changing.
2. Preserve the API contract and the domain rules above.
3. Add or update focused tests with behavior changes.
4. Run the smallest relevant typecheck, lint, and test commands.
5. Never commit secrets, local `.env` files, generated dependencies, or
   unreviewed model/data artifacts.

## License

No license file is currently present in this repository. Until the project
owners add one, assume the code is not licensed for redistribution or
commercial reuse.
