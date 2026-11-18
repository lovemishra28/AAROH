<div align="center">

# 🌱 AgroPulse (एग्रो Pulse)
### *Smart Farming. Better Future.* • आपकी खेती, आपकी तरक्की

[![React Native](https://img.shields.io/badge/React%20Native-0.79%20(Fabric)-22421A?style=for-the-badge&logo=react&logoColor=61DAFB)](./AAROH-Client)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2053-1F5A2A?style=for-the-badge&logo=expo&logoColor=white)](./AAROH-Client)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-22421A?style=for-the-badge&logo=nodedotjs&logoColor=5FA04E)](./AAROH-Server/api)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-PostGIS%203.4-1F5A2A?style=for-the-badge&logo=postgresql&logoColor=white)](./AAROH-Server/database)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%20FastAPI-22421A?style=for-the-badge&logo=python&logoColor=FFE873)](./AAROH-Server/ai)
[![Machine Learning](https://img.shields.io/badge/ML-LightGBM%20%7C%20ONNX-FE7F02?style=for-the-badge&logo=onnx&logoColor=white)](./AAROH-Server/ai)
[![Hardware](https://img.shields.io/badge/Hardware-ESP32%20%7C%20BLE%205.0-187F21?style=for-the-badge&logo=espressif&logoColor=white)](./Hardware)

<br/>

<img src="docs/assets/logo.png" alt="AgroPulse Logo" width="280" />

<br/>

**AgroPulse** (*internal code name: **Aaroh***) is an end-to-end, offline-first precision soil advisory and agronomic intelligence platform designed specifically for smallholder farmers in the **Gwalior / Chambal** agro-climatic region of Madhya Pradesh, India.

It transforms raw, multi-depth soil readings into **actionable, costed agricultural decisions**:
- 🌾 **Which crop to sow** based on calibrated soil suitability distributions;
- 🧪 **Exact nutrient deficits** calculated through regional agronomic guidelines;
- 📦 **Physical fertilizer bag counts** (Urea, DAP, MOP in 50 kg bags); and
- 💰 **Estimated rupee costs (₹)** tailored to local market pricing.

---

### 📱 Live Mobile App Experience

<img src="docs/assets/agropulse-mobile-preview.gif" alt="AgroPulse Mobile App Interactive Walkthrough" width="380" style="border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);" />

*Step-by-step mobile workflow: Brand Splash ➔ Hindi/English Kisan Authentication ➔ Real-Time Soil Telemetry ➔ Spatial Fertility Map & Advisory*

</div>

---

## 📸 Visual Showcase & Architecture Gallery

### 1. Farmer-First Mobile Experience (`AAROH-Client`)
The AgroPulse mobile app is built with **React Native (Expo SDK 53 + New Architecture / Fabric)** with a **Hindi-first, bilingual interface** optimized for sunlight legibility (≥16–18sp typography, 48dp touch targets).

| 1. Onboarding & Login | 2. Field Telemetry Dashboard | 3. Spatial Fertility Map & Advice |
|:---:|:---:|:---:|
| <img src="docs/assets/agropulse-login.jpg" width="260" alt="AgroPulse Welcome Screen" /> | <img src="docs/assets/agropulse-dashboard.jpg" width="260" alt="Field 1 Soil Overview" /> | <img src="docs/assets/agropulse-fertility-map.png" width="260" alt="Spatial Fertility Heatmap" /> |
| **Friendly Kisan Onboarding**<br/>• Mobile OTP & Google Auth<br/>• Dual-language (हिन्दी / EN)<br/>• Zero mandatory typing | **Real-Time Soil Metrics**<br/>• N, P, K elemental values<br/>• pH, Salinity (EC), Moisture, Temp<br/>• Instant field switcher (Field 1, 2, 3) | **Spatial Precision Heatmap**<br/>• 2D interpolated fertility grid<br/>• Multi-point GPS sensor nodes<br/>• Top crop pick & STCR fertilizer advice |

---

### 2. Research-Grade AI & Agronomy Web Dashboard (`evaluation/`)
AgroPulse pairs probabilistic machine learning with deterministic agronomic science. The model evaluation engine rigorously validates candidate models across cross-validation, calibration, noise robustness, and ranking quality.

| AI Model Evaluation Web Report | Crop Class Confusion Matrix |
|:---:|:---:|
| <img src="docs/assets/ai-evaluation-benchmark.png" width="480" alt="AgroPulse Evaluation Web Report" /> | <img src="docs/assets/ai-confusion-matrix.png" width="480" alt="Crop Confusion Matrix" /> |
| **Comprehensive Web Benchmark Dashboard**<br/>Interactive HTML report (`final evolution report.html`) auditing ranking metrics (NDCG@3, Top-k accuracy), split sensitivities, and inference latencies. | **Multi-Class Prediction Matrix**<br/>Benchmarked across 22+ agricultural crops with soft-probability distribution and calibrated decision boundaries. |

| Model Performance Benchmark Comparison | Soil Feature Distribution Audit |
|:---:|:---:|
| <img src="docs/assets/ai-model-comparison.png" width="480" alt="AI Model Comparison" /> | <img src="docs/assets/soil-features-distribution.png" width="480" alt="Soil Feature Histograms" /> |
| **Multi-Family Model Benchmark**<br/>Comparing LightGBM, XGBoost, Random Forest, ExtraTrees, SVM, KNN, and MLP on macro F1, NDCG@3, and Brier score. | **Physiochemical Distributions**<br/>Distribution histograms and outlier bounds for Nitrogen, Phosphorus, Potassium, pH, Electrical Conductivity, and Temperature. |

---

## 🧭 Table of Contents

- [How the System Works](#-how-the-system-works)
- [System Architecture](#-system-architecture)
- [Key Features & Innovations](#-key-features--innovations)
- [Repository Structure](#-repository-structure)
- [Technology Stack](#-technology-stack)
- [Quick Start Guide](#-quick-start-guide)
  - [Prerequisites](#prerequisites)
  - [1. Backend Stack Setup (Docker or Local)](#1-backend-stack-setup)
  - [2. Database Migrations](#2-database-migrations)
  - [3. Mobile Application Setup](#3-mobile-application-setup)
  - [4. AI Model & CLI Predictor](#4-ai-model--cli-predictor)
- [Hardware & BLE Sensor Stick](#-hardware--ble-sensor-stick)
- [The Dual-Engine Intelligence](#-the-dual-engine-intelligence)
- [Testing & Quality Verification](#-testing--quality-verification)
- [Design System & Theming](#-design-system--theming)
- [Domain Rules & Production Guidelines](#-domain-rules--production-guidelines)
- [Documentation Index](#-documentation-index)

---

## ⚡ How the System Works

```
                     ┌──────────────────────────────────────────┐
                     │    ESP32 Soil Sensing Hardware Stick     │
                     │  7-in-1 RS485 Modbus Sensor (NPK/pH/EC)  │
                     │   GPS Fix + RTC + LittleFS Local Buffer  │
                     └────────────────────┬─────────────────────┘
                                          │
                                          │ BLE 5.0 Wireless Sync (Offline-First)
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │           AgroPulse Mobile App           │
                     │  React Native (Fabric) • Zustand Offline │
                     │   2D Spatial Fertility Map • Hindi/EN    │
                     └────────────────────┬─────────────────────┘
                                          │
                                          │ HTTPS / REST (JWT Auth)
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │          Node.js / Express API           │
                     │      PostgreSQL 16 + PostGIS Spatial     │
                     │    DBSCAN Automatic Field Segregation    │
                     └────────────────────┬─────────────────────┘
                                          │
                                          │ Internal Microservice Request
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │          Python / FastAPI AI             │
                     │  ├── 1. Probabilistic Crop Ranker (ONNX) │
                     │  └── 2. Deterministic STCR Agronomy (₹)  │
                     └──────────────────────────────────────────┘
```

1. **In-Field Soil Sensing**: The farmer presses the handheld AgroPulse stick into the soil across sampling locations. An ESP32 reads N, P, K, pH, electrical conductivity (EC), moisture, and temperature, timestamping records with GPS and RTC coordinates into non-volatile LittleFS flash storage.
2. **Offline-First BLE Sync**: When the mobile app is within range, it connects over Bluetooth Low Energy (BLE), securely transfers batched ASCII telemetry frames, verifies checksums, and clears the hardware buffer.
3. **Automatic Spatial Field Segregation**: Rather than forcing farmers to manually draw complex farm boundaries, the backend uses **PostGIS spatial clustering (DBSCAN)** to detect distinct fields and partition readings into separate plots automatically.
4. **Dual-Engine Agronomic Analysis**:
   - **Engine A (ML Crop Ranker)**: Predicts probabilistic suitability across crops using soft multi-label distributions.
   - **Engine B (Deterministic Agronomy)**: Applies ICAR (Indian Council of Agricultural Research) Soil Test Crop Response (STCR) formulas to calculate fertilizer dosage, exact bag counts, and rupee costs (₹).

---

## 🌟 Key Features & Innovations

- 📶 **100% Offline-First Architecture**: Designed for rural areas with patchy or absent cellular reception. Both the sensing stick and mobile client queue readings locally and sync idempotently upon reconnecting.
- 🗺️ **Automatic Field Segregation**: Zero manual polygon drawing. Clustering algorithms group spatial sensor readings into distinct field management zones.
- 🎯 **Dual-Engine Integrity**: Machine learning ranks crop suitability; deterministic agronomic formulas calculate fertilizers and rupee values. The system never lets a black-box model invent monetary numbers.
- 🇮🇳 **Bilingual & Rural UX**: Supports Hindi (हिन्दी) and English out of the box with clear audio feedback (Expo Speech), high-contrast cards, and large touch targets.
- 🛡️ **Scientific Honesty & Provenance**: Clearly distinguishes proxy sensor readings from laboratory measurements, highlighting data uncertainty and regional validation bounds.
- 📊 **Research-Grade Evaluation Suite**: Complete with cross-validation pipelines, golden test cases, HTML evolution reports, and ONNX Runtime production exports.

---

## 📂 Repository Structure

```text
/home/lovemishra/AAROH/
├── docs/                             # Documentation assets and screenshots
│   └── assets/                       # High-resolution screenshots, charts, and demo GIF
├── AAROH-Client/                     # React Native / Expo Mobile Application
│   ├── src/                          # Screens, navigation, store, API, BLE, and i18n
│   │   ├── features/                 # Home dashboard, sync, field switcher, advice
│   │   ├── components/               # Metric tiles, heatmaps, shimmer skeletons
│   │   ├── api/                      # TanStack Query hooks and Axios HTTP clients
│   │   └── theme/                    # Color tokens, typography, and styling
│   ├── android/                      # Native Android project (Gradle, CMake, C++)
│   ├── scripts/                      # Cross-platform device launchers (.sh and .mjs)
│   ├── BLE_PROTOCOL.md               # Hardware ↔ Mobile BLE communication specification
│   └── package.json
├── AAROH-Server/                     # Backend & AI Monorepo
│   ├── api/                          # Public Node.js / Express TypeScript API
│   │   ├── src/modules/              # Auth, fields, readings, devices, recommendations
│   │   ├── scripts/                  # Cluster verification & integration checks
│   │   └── package.json
│   ├── ai/                           # Python / FastAPI Machine Learning Subsystem
│   │   ├── datasets/raw/             # Source agronomic datasets & crop parameter tables
│   │   ├── models/registry/          # Active model registry and metadata
│   │   ├── src/aaroh_ai/             # Training, inference, feature pipeline & agronomy
│   │   └── pyproject.toml
│   ├── database/migrations/          # PostgreSQL / PostGIS schema migrations
│   └── docker-compose.yml            # Local orchestration for PostgreSQL, API, and AI
├── evaluation/                       # Independent ML Evaluation & Audit Suite
│   ├── artifacts/                    # Benchmark JSONs, SVG/PNG figures, DOM renders
│   ├── verify_report.py              # Automated report validation script
│   └── test_evaluation.py            # Evaluation test cases (Pytest)
├── Hardware/esp_code/                # Arduino / ESP32 C++ Firmware Source
│   └── esp_code.ino                  # Sensor polling, LittleFS, OLED, and BLE stack
├── final evolution report.html        # Comprehensive interactive HTML evaluation report
├── run_predictor.sh                  # Linux/macOS CLI inference launcher
├── run_predictor.bat                 # Windows CMD CLI inference launcher
└── README.md                         # Project documentation
```

---

## 🛠️ Technology Stack

| Layer | Technologies | Purpose |
|:---|:---|:---|
| **Mobile App** | React Native 0.79, Expo SDK 53, TypeScript | Cross-platform client with New Architecture (Fabric) |
| **Mobile State & UI** | NativeWind (Tailwind CSS), Zustand, TanStack Query | Reactive state, offline queues, cached API queries |
| **Mobile Native** | `react-native-ble-plx`, SecureStore, Expo Speech | BLE sensor stick communication, encrypted auth tokens |
| **Public API** | Node.js 22 LTS, Express, TypeScript, Zod | Input validation, JWT auth, business logic boundary |
| **Spatial Database** | PostgreSQL 16, PostGIS 3.4 | Geospatial points, field clustering, and transactional data |
| **AI & Inference** | Python 3.11+, FastAPI, ONNX Runtime | High-throughput low-latency crop ranking service |
| **Model Families** | LightGBM, XGBoost, CatBoost, Scikit-Learn | Supervised soft-probability crop suitability estimation |
| **Hardware Firmware** | ESP32 Dev Module, C++, LittleFS, RS485 Modbus | In-situ soil sensing stick, battery & BLE management |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v22 LTS or newer (`node -v`)
- **Python**: 3.11 or newer (`python3 --version`)
- **Docker & Docker Compose**: For containerized database and backend services
- **Android SDK & Build Tools**: Android Studio with NDK 27+ (for native mobile compilation)
- **Git**

---

### 1. Backend Stack Setup

#### Option A: Run via Docker Compose (Recommended)
```bash
cd AAROH-Server
cp .env.example .env
docker compose up --build -d
```

#### Option B: Run Services Locally
```bash
# 1. Start the Python AI service
cd AAROH-Server/ai
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[train,dev]"
uvicorn aaroh_ai.inference.service:app --host 0.0.0.0 --port 8000 --reload &

# 2. Start the Node.js API
cd ../api
npm install
cp .env.example .env
npm run dev
```

The services will be available at:
- 🌐 **Public API**: `http://localhost:3000` (Health: `http://localhost:3000/v1/health`)
- 🧠 **AI Service**: `http://localhost:8000` (Health: `http://localhost:8000/health`)
- 🐘 **PostgreSQL (PostGIS)**: `localhost:5433`

---

### 2. Database Migrations

Apply spatial PostGIS migrations to initialize schemas:

```bash
cd AAROH-Server/api
export DATABASE_URL="postgres://aaroh:aaroh@localhost:5433/aaroh"
npm run migrate:up
```

---

### 3. Mobile Application Setup

The client is an Expo Dev Client app requiring native Android modules (BLE, SVG):

```bash
cd AAROH-Client
npm install
cp .env.example .env
```

#### Launching on a Connected Android Phone (USB Debugging):
```bash
# Verify phone is detected
adb devices

# Start Metro and install the application
npm run phone
```

#### Launching on the Android Emulator:
```bash
# Start your Android Virtual Device (AVD)
~/Android/Sdk/emulator/emulator -avd Medium_Phone_API_37.0 &

# Run debug assemble and launch
npm run start:emulator
```

> **Direct APK Installation:**
> A pre-compiled debug APK supporting all 4 architectures (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) is built and ready at:
> `AAROH-Client/android/app/build/outputs/apk/debug/app-debug.apk`
> 
> Install directly via ADB:
> ```bash
> adb install -r AAROH-Client/android/app/build/outputs/apk/debug/app-debug.apk
> ```

---

### 4. AI Model & CLI Predictor

You can run stand-alone agronomic inference directly from your terminal:

#### On Linux / macOS:
```bash
./run_predictor.sh --raw 85 18 140 6.2 0.45 18 28
```

#### On Windows (PowerShell / CMD):
```powershell
.\run_predictor.ps1 -RawReading 85,18,140,6.2,0.45,18,28
```

**Output:**
```json
{
  "top_crops": [
    {"crop": "soybean", "probability": 0.412, "suitability": "HIGH"},
    {"crop": "mustard", "probability": 0.328, "suitability": "MEDIUM"},
    {"crop": "wheat", "probability": 0.205, "suitability": "VIABLE"}
  ],
  "recommendation": {
    "crop": "soybean",
    "fertilizer_plan": {
      "urea_bags_50kg": 1.2,
      "dap_bags_50kg": 2.5,
      "mop_bags_50kg": 0.8,
      "estimated_cost_inr": 3480
    }
  }
}
```

---

## 📡 Hardware & BLE Sensor Stick

The AgroPulse sensing stick is an ergonomic handheld agricultural probe built around an **ESP32 Dev Module**:

<div align="center">
  <img src="docs/assets/farmer-hero.png" width="220" alt="AgroPulse Kisan Mascot" />
</div>

- **Sensor Hardware**: 7-in-1 Modbus RS485 soil sensor probe measuring Nitrogen (N), Phosphorus (P), Potassium (K), pH, Salinity (Electrical Conductivity), Moisture (%), and Soil Temperature (°C).
- **Peripherals**: SSD1306 0.96" I2C OLED display, DS3231 RTC module, NEO-6M GPS receiver, tactile trigger button.
- **Offline Storage**: Integrated LittleFS flash file system buffering hundreds of measurements when outside cellular or Bluetooth coverage.
- **BLE Service Contract**:
  - **Custom Service UUID**: `00000001-aa00-4b89-8d3a-000000000001`
  - **Data Characteristic**: `00000002-aa00-4b89-8d3a-000000000001` (Notify/Read)
  - **Command Characteristic**: `00000003-aa00-4b89-8d3a-000000000001` (Write)
- **Protocol Details**: Detailed in [`AAROH-Client/BLE_PROTOCOL.md`](./AAROH-Client/BLE_PROTOCOL.md).

---

## 🔬 The Dual-Engine Intelligence

AgroPulse enforces a strict separation of concerns between statistical prediction and agronomic science:

```
                      Raw Soil Sensor Reading
                  (N, P, K, pH, EC, Moisture, Temp)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       Engine 1: Machine Learning     Engine 2: STCR Agronomy
       ┌────────────────────────┐     ┌────────────────────────┐
       │ • LightGBM / XGBoost   │     │ • Regional ICAR Rules  │
       │ • Soft crop ranking    │     │ • Deficit subtraction  │
       │ • Suitability index    │     │ • 50kg bag conversion  │
       │ • 22+ crop candidates  │     │ • Rupee (₹) pricing    │
       └──────────────┬─────────┘     └───────────┬────────────┘
                      │                           │
                      └─────────────┬─────────────┘
                                    ▼
                     Actionable Farmer Advisory
                 "Top Pick: Soybean • 2.5 Bags DAP • ₹3,480"
```

1. **Why ML does not calculate money**: Market fertilizer costs and nutrient absorption formulas are bounded by chemistry and government pricing policies. Letting an ML model guess currency quantities risks hallucinating toxic fertilizer overages or financial debt for the farmer.
2. **Why deterministic code does not rank crops**: Complex non-linear interactions across pH, electrical conductivity, seasonal temperature, and multi-nutrient balances are captured with higher fidelity by gradient-boosted decision trees.

---

## 🧪 Testing & Quality Verification

All subsystems contain strict, isolated test suites to prevent regression:

```bash
# 1. Client TypeScript Verification
cd AAROH-Client && npm run typecheck

# 2. Node.js API Test Suite (122+ passing unit and integration tests)
cd AAROH-Server/api && npm test

# 3. Spatial DBSCAN Clustering Verification
cd AAROH-Server/api && npm run verify:clustering

# 4. Python AI Subsystem Test Suite (80+ passing tests)
cd AAROH-Server/ai && pytest

# 5. Independent Evaluation Report Validation
pytest evaluation/test_evaluation.py
```

---

## 🎨 Design System & Theming

The visual identity of AgroPulse is rooted in Indian agriculture, inspired by lush green fields, healthy soil, and intuitive accessibility:

<div align="center">

| Token | Hex | Role | Visual Preview |
|:---|:---|:---|:---:|
| `primary` | `#22421A` | Deep Forest Green — Primary buttons, major headers | <img src="https://via.placeholder.com/60x24/22421A/ffffff?text=+" alt="#22421A" /> |
| `primary-alt` | `#1F5A2A` | Vibrant Foliage Green — Subheaders, link accents | <img src="https://via.placeholder.com/60x24/1F5A2A/ffffff?text=+" alt="#1F5A2A" /> |
| `accent` | `#FE7F02` | Devanagari Saffron Orange — Brand logo highlight & alerts | <img src="https://via.placeholder.com/60x24/FE7F02/ffffff?text=+" alt="#FE7F02" /> |
| `success` | `#187F21` | High-fertility soil zone, "Strong" rating | <img src="https://via.placeholder.com/60x24/187F21/ffffff?text=+" alt="#187F21" /> |
| `warning` | `#F2A93B` | Moderate fertility, requires corrective input | <img src="https://via.placeholder.com/60x24/F2A93B/ffffff?text=+" alt="#F2A93B" /> |
| `danger` | `#B80C26` | Deficient fertility zone, destructive actions | <img src="https://via.placeholder.com/60x24/B80C26/ffffff?text=+" alt="#B80C26" /> |
| `tint-surface`| `#F2FFE2` | Soft Pastel Green — Info callouts, badge backgrounds | <img src="https://via.placeholder.com/60x24/F2FFE2/000000?text=+" alt="#F2FFE2" /> |
| `surface` | `#FFFFFF` | Crisp White Card background (76% dominant) | <img src="https://via.placeholder.com/60x24/FFFFFF/000000?text=+" alt="#FFFFFF" /> |

</div>

- **Typography**: Primary typeface is **Poppins** (friendly, geometric, designed by Indian Type Foundry) paired with **Noto Sans Devanagari** to ensure rendering of Hindi conjuncts (क्ष, त्र, ज्ञ, श्र) and matras.
- **Physical Scale**: High-legibility standards: Headings (24–32sp), Body text (≥17sp), Minimum touch targets (48×48dp).

---

## 📜 Domain Rules & Production Guidelines

1. **Unit Discipline**: Always preserve physical measurement units in variable names and database schemas (`n_mgkg`, `p_mgkg`, `k_mgkg` vs. `n_kgha`, `p2o5_kgha`, `k2o_kgha`).
2. **Field Scaling**: Field area in hectares or acres is applied *after* agronomic deficit calculation to scale total bag counts; it is never fed into the ML crop suitability ranker.
3. **NPK Proxy Honesty**: In-situ optical/electrochemical NPK sensors are treated as uncalibrated proxies until calibrated against accredited wet-chemistry soil lab tests.
4. **Geographic Scoping**: Agricultural rules, crop calendars, and fertilizer subsidy caps currently target the **Gwalior / Chambal** agro-climatic division.

---

## 📚 Documentation Index

- 📱 [Mobile Client Setup & Guide](./AAROH-Client/README.md)
- 🎨 [Design Direction & Token Specifications](./AAROH-Client/DESIGN_DIRECTION.md)
- 📡 [BLE Hardware Wire Protocol](./AAROH-Client/BLE_PROTOCOL.md)
- 🗺️ [Field Spatial Segregation Guide](./AAROH-Client/FIELD_SEGREGATION_TEST.md)
- 🖥️ [Backend Server Architecture](./AAROH-Server/README.md)
- 🧠 [AI Model Training & Registry](./AAROH-Server/ai/README.md)
- 🌐 [API OpenAPI Specification](./AAROH-Server/api/openapi.yaml)
- 🔬 [Evaluation Benchmark HTML Report](./final%20evolution%20report.html)
- ⚡ [Hardware Firmware (Arduino/C++)](./Hardware/esp_code/esp_code.ino)

---

<div align="center">

Made with ❤️ for Indian farmers • **AgroPulse / Aaroh Initiative**

</div>
