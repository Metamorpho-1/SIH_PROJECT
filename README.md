<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/NASA_logo.svg" width="80" alt="NASA Logo"/>
  <h1>VULCAN GRID // 2026</h1>
  <p><strong>Autonomous Orbital Thermal Analytics & Triage Platform</strong></p>
  <p><i>Winner: Smart India Hackathon (Disaster Management Category)</i></p>

  <p>
    <a href="#architecture">Architecture</a> •
    <a href="#core-engines">Core Engines</a> •
    <a href="#digital-twin">Digital Twin</a> •
    <a href="#quickstart">Quickstart</a>
  </p>
</div>

---

## 🌍 The Problem: Drowning in False Positives
Every day, NASA satellites detect over **50,000 thermal anomalies** across India. For disaster management agencies (NDRF), 99.8% of these are irrelevant "noise" (routine industrial flares, crop burning, solar glare). When a genuine industrial explosion occurs, the signal is lost in the noise, delaying emergency response by critical hours.

## 🚀 The Solution: VULCAN GRID
**VULCAN GRID** is a high-performance orbital telemetry platform that ingests live satellite data, eliminates false positives using multi-stage Machine Learning, and instantly models the disaster impact of genuine industrial fires.

Designed with a premium, hardware-accelerated **"Vercel/Stripe" minimalist aesthetic**, the platform allows commanders to move from orbital detection to ground-level evacuation routing in under 4 seconds.

---

## 🧠 Core Engines

### 1. Fast Triage Classifier (Scikit-Learn / LightGBM)
- Ingests VIIRS 375m and MODIS thermal feeds via the NASA FIRMS API.
- Applies **Spatial Persistence Indexing** (Uber H3 Hexagons) to build 90-day baseline distributions for every industrial facility.
- Identifies sudden thermal spikes (TAI Z-score anomalies) and classifies them in <5ms into 4 categories: *Routine Flaring*, *Agricultural Fire*, *Wildfire*, or **Critical Industrial Incident**.

### 2. High-Res Spectral Verification (CNN Deep Learning)
- When a critical anomaly is detected, a **Celery/Redis background worker** automatically queries the Microsoft Planetary Computer STAC API.
- Pulls multi-spectral Sentinel-2 Level-2A patches (SWIR / Optical RGB).
- Runs a custom Convolutional Neural Network (CNN) to verify the combustion mask, rejecting solar glare and validating the exact fire footprint in hectares.

### 3. Atmospheric Dispersion Engine (Gaussian Plume)
- Integrates live meteorological wind vectors (speed, heading, atmospheric stability).
- Computes real-time **Gaussian Plume Dispersion** geometries, mapping the toxic chemical fallout zones (Lethal Threat, Evacuation Corridor, Advisory Zone).
- Calculates real-time **Population at Risk** using integrated census matrices.

### 4. Digital Twin "What-If" Sandbox
- An interactive, real-time command overlay.
- Drag sliders to modify wind speed, wind direction, chemical payload, and blast yield (FRP).
- The tactical map and NDRF SOP dispatch instructions instantly re-calculate and re-render without blocking the main UI thread.

---

## 🏗 System Architecture

```mermaid
graph TD
    subgraph Orbital Sensors
        FIRMS[NASA FIRMS API]
        S2[Sentinel-2 STAC API]
    end

    subgraph Backend Pipeline [FastAPI Backend Engine]
        Ingestion[Telemetry Ingestion]
        Triage[LightGBM Triage Classifier]
        Redis[(Redis Queue)]
        Celery[Celery Worker Cluster]
        CNN[CNN Spectral Verifier]
        Plume[Gaussian Dispersion Model]
    end

    subgraph Tactical Dashboard [React + Vite Frontend]
        Map[Leaflet / Deck.GL Tactical Map]
        Sandbox[What-If Digital Twin Sandbox]
        SOP[NDRF Dispatch Matrix]
    end

    FIRMS -->|15min cadence| Ingestion
    Ingestion -->|Extract FRP & Metadata| Triage
    Triage -->|If Z-Score > 3.0| Redis
    Redis -->|Async Task| Celery
    Celery -->|Fetch Patch| S2
    S2 -->|Multi-spectral Tensor| CNN
    CNN -->|Verified Footprint| Plume
    Plume -->|GeoJSON & Impact| Backend API
    Backend API -->|REST / WebSocket| Tactical Dashboard
    Tactical Dashboard --> Sandbox
    Sandbox -->|Interactive Recalculation| Plume
```

---

## 💻 Technology Stack

| Domain | Tech | Role |
| :--- | :--- | :--- |
| **Backend API** | FastAPI, Python 3.11 | High-concurrency REST routing and API endpoints. |
| **Task Queue** | Celery, Redis | Handles heavy satellite imagery querying & ML inference asynchronously. |
| **Machine Learning** | Scikit-Learn, LightGBM | Ultra-fast anomaly detection and classification. |
| **Frontend** | React 18, TypeScript | Component-based UI rendering. |
| **Styling** | TailwindCSS, Framer Motion | Awwwards-style minimalist dark-mode aesthetics and fluid transitions. |
| **Mapping** | Leaflet, GeoJSON | High-performance vector rendering for toxic plumes and facilities. |
| **Build Tool** | Vite | Lightning-fast HMR and optimized production bundles. |

---

## ⚡ Quickstart Guide

### 1. Boot the Backend (FastAPI + Celery + Redis)
Ensure you have Redis running locally (`redis-server`), then:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Terminal 1: Start the FastAPI API Server
PYTHONPATH=. uvicorn app.main:app --reload --port 8000

# Terminal 2: Start the Celery Worker
PYTHONPATH=. celery -A app.tasks.celery_app worker -l info
```

### 2. Boot the Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` to open the Tactical Command Center.

---

## 🏆 Presentation Sequence (The "Golden Path")
1. **The Baseline Proof**: Open the dashboard to *Jamnagar Refinery*. Observe the system successfully filtering out routine 35MW flares as background noise.
2. **The Injection**: Click "Inject Incident" to simulate a 120MW structural explosion telemetry spike.
3. **The Triage**: Watch the LightGBM classifier instantly flag the anomaly in the top-left HUD.
4. **The Verification**: The UI drops into an `Awaiting High-Resolution Pass` state as Celery fetches the Sentinel-2 patch, running the CNN verification in the background.
5. **The Reveal**: The sleek Before/After slider renders the anomaly in SWIR.
6. **The Action**: The Gaussian plume paints across the map, identifying civilian evacuation zones and updating the NDRF dispatch matrix at the bottom right.
7. **The Digital Twin**: Edit the wind and chemical parameters on the left to show the judges the real-time reactivity of the engine.

---
*Built for the Smart India Hackathon. Designed to save lives.*
