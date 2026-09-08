# AURA-Fire: Operational Spatio-Temporal Intelligence System

[![SIH 2026](https://img.shields.io/badge/SIH_2026-Problem_26162-blue.svg)](https://www.sih.gov.in/)
[![Organization](https://img.shields.io/badge/Organization-NTRO-red.svg)](https://ntro.gov.in/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![PostGIS](https://img.shields.io/badge/PostGIS-3.4_/_PG16-336791.svg?logo=postgresql)](https://postgis.net/)
[![Uber H3](https://img.shields.io/badge/Uber_H3-Res--8_Grid-orange.svg)](https://h3geo.org/)
[![LightGBM](https://img.shields.io/badge/LightGBM-Sub--5ms_Triage-brightgreen.svg)](https://lightgbm.readthedocs.io/)

> **Automated Detection, Baseline Characterization, & Multi-Class Triage of Industrial Thermal Anomalies using NASA FIRMS, OpenStreetMap (OSM), and Sentinel-2 Multi-Spectral Data.**

---

## 1. Executive Summary & Operational Problem Definition

The **National Technical Research Organisation (NTRO)** oversees technical intelligence and critical asset security across India. Currently, open satellite thermal anomaly detection systems (such as NASA FIRMS VIIRS/MODIS) yield coarse 375m hotspot alerts devoid of contextual semantics. A single thermal coordinate could signify a routine gas flare at an oil refinery, agricultural residue burning in Punjab, a spreading wildfire, or a catastrophic industrial explosion.

### The Core Operational Problem
Existing satellite alert services suffer from a severe dual failure mode:
1. **Excessive False Alarms**: Flagging routine, safe industrial flares as active fire emergencies.
2. **Static Masking Vulnerability**: Completely blinding monitoring systems to real explosions or fires occurring *inside* industrial perimeters by masking known plants.

There is no automated operational system dynamically discerning **routine industrial thermal equilibrium** from **hazardous excursions**.

### The AURA-Fire Solution
AURA-Fire resolves this through an event-driven, multi-tiered pipeline:
* **Spatio-Temporal Indexing**: Discrete global hexagonal grid binning (**Uber H3 Resolution 8**, ~0.73 km²) fused with OpenStreetMap (OSM) industrial infrastructure geometries (`landuse=industrial`, `man_made=flare_stack`).
* **Dynamic Baseline Modeling**: Rolling 90-day continuous historical Fire Radiative Power (FRP) and persistence scoring to profile normal operating thresholds per facility cell.
* **Dual-Tier AI Classification**: Sub-5ms LightGBM multi-class triage on telemetry, followed by targeted asynchronous Sentinel-2 SWIR/optical deep-learning verification.
* **Atmospheric Dispersion Simulation**: Integrated real-time Gaussian plume modeling over Open-Meteo 10m wind vectors to forecast toxic hazard footprints for civil defense and NDRF evacuation planning.

---

## 2. End-to-End System Architecture & Data Flow

```
+---------------------------------------------------------------------------------------------------+
|                                      AURA-FIRE ARCHITECTURE                                       |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [NASA FIRMS VIIRS 375m]                                                                         |
|            |                                                                                      |
|            v                                                                                      |
|  +---------------------+        +-------------------------+                                       |
|  | Stage 1: Ingestion  | -----> | PostGIS Spatial Join    | (OSM Industrial Geometries)          |
|  | & H3 Res-8 Binning  |        +-------------------------+                                       |
|  +---------------------+                     |                                                    |
|            |                                 v                                                    |
|            +--------------------> +---------------------------------------------+                 |
|                                   | Stage 2: Anomaly & ML Triage (LightGBM)     |                 |
|                                   | - SPF (Spatial Persistence Factor)          |                 |
|                                   | - TAI (Thermal Anomaly Index Z-Score)       |                 |
|                                   +---------------------------------------------+                 |
|                                                      |                                            |
|                       +------------------------------+-------------------------------+            |
|                       |                              |                               |            |
|                       v                              v                               v            |
|                 [Class 0: Routine]         [Class 2: Stubble]             [Class 3: Wildfire]     |
|                 - Suppress alarm           - Route to SPCB                - Route to FSI          |
|                 - Update baseline                                                                 |
|                                                      |                                            |
|                                                      v                                            |
|                                        [Class 1: Accidental Blaze]                                |
|                                                      |                                            |
|                        +-----------------------------+-----------------------------+              |
|                        |                                                           |              |
|                        v                                                           v              |
|          +----------------------------+                            +----------------------------+ |
|          | Stage 3: High-Res Verif.   |                            | Stage 4: Tactical Command  | |
|          | - Planetary Computer STAC  |                            | - Open-Meteo Wind Vectors  | |
|          | - Sentinel-2 SWIR / NBR    |                            | - Gaussian Plume Footprint | |
|          | - Active combustion patch  |                            | - Deck.gl 3D Tactical UI   | |
|          +----------------------------+                            | - Automated SOP Dispatch   | |
|                                                                    +----------------------------+ |
+---------------------------------------------------------------------------------------------------+
```

### Pipeline Stages
1. **Pipeline Stage 1: Ingestion & Indexing**
   - Automated ingestion of VIIRS VNP14IMGTDL (375m) NRT streams every 15 minutes.
   - Spatial binning to H3 Resolution 8 cells (~460m edge length, ~0.73 km² area).
   - PostGIS spatial intersection against cached OSM industrial polygons (`landuse=industrial`, `man_made=flare_stack`).
2. **Pipeline Stage 2: Anomaly & ML Triage**
   - Temporal rolling window: computes 90-day persistence ratio and baseline FRP distribution ($\mu_{\text{FRP}}$, $\sigma_{\text{FRP}}$).
   - Thermal Anomaly Index (TAI) Z-score calculation.
   - Sub-5ms classification into 4 operational classes via LightGBM.
3. **Pipeline Stage 3: High-Res Satellite Verification**
   - Anomalies with $\text{TAI} > 3.0$ trigger Celery worker tasks.
   - Dynamic STAC API queries to Microsoft Planetary Computer for recent Sentinel-2 Level-2A BOA reflectance tiles.
   - Normalized Burn Ratio (NBR) and Band 12 SWIR anomaly computation to verify combustion cores.
4. **Pipeline Stage 4: Tactical Command**
   - Real-time Open-Meteo 10m wind vector integration for Gaussian toxic plume tracing.
   - Hardware-accelerated WebGL Tactical Dashboard (React.js + Deck.gl + Mapbox GL).
   - Automated SOP dispatch (Webhooks/SMS) to industrial safety regulators and NDRF teams.

---

## 3. Algorithmic Formulation & Classification Logic

### A. Spatial Persistence Factor (SPF)
For any H3 index cell $h$, over a temporal observation window of $T$ overpasses (default: 90 days):

$$\text{SPF}(h) = \frac{1}{T} \sum_{t=1}^{T} \mathbb{I}(\text{Hotspot}_t \in h)$$

Where $\mathbb{I}(\cdot)$ is an indicator function.
* **$\text{SPF} \ge 0.35$**: Stationary industrial facilities (refinery gas flares, coke ovens, petrochemical kilns).
* **$\text{SPF} \le 0.05$**: Agricultural fires with temporal/spatial drift across seasonal crop cycles.

### B. Fire Radiative Power Anomaly Index (TAI)
For an observed thermal detection with radiative power $\text{FRP}_{\text{obs}}$ inside an industrial cell $h$:

$$\text{TAI} = \frac{\text{FRP}_{\text{obs}} - \mu_{\text{FRP}}(h)}{\sigma_{\text{FRP}}(h) + \epsilon}$$

* **$\text{TAI} \le 2.5$**: Routine flaring in thermal equilibrium.
* **$\text{TAI} > 3.5$**: Non-periodic structural blaze or explosion excursion, triggering an immediate Critical Alert.

---

## 4. Machine Learning Feature Pipeline & Classification Taxonomy

The Stage-1 LightGBM classifier categorizes every incoming satellite detection into four discrete operational taxonomy classes:

| Class Tag | Classification Category | Key Distinguishing Feature Signatures | Operational Response |
| :--- | :--- | :--- | :--- |
| **CLASS 0** | **Routine Industrial Activity** | High SPF ($>0.4$), $\text{TAI} \le 2.0$, inside OSM industrial polygon, stable FRP profile. | **Suppress alarm**; update rolling baseline distribution. |
| **CLASS 1** | **Accidental Industrial Fire / Explosion** | High SPF baseline, $\text{TAI} > 3.0$, severe brightness temp excursion (Band I4 $> 350\text{ K}$). | **Critical Alert**: Trigger Sentinel-2 pull & automated SOP dispatch. |
| **CLASS 2** | **Agricultural / Stubble Burning** | Zero SPF ($<0.05$), high regional spatial clustering, non-industrial land cover, seasonal peak. | **Route to State Pollution Control Boards (SPCB)**. |
| **CLASS 3** | **Wildfire / Forest Fire** | Contiguous spatial sprawl, high forest cover fraction, moving centroid over consecutive overpasses. | **Route to Forest Survey of India (FSI)** feeds. |

---

## 5. Technology Stack

| Domain | Technology Choice | Architectural Rationale & Implementation Details |
| :--- | :--- | :--- |
| **Data Ingestion** | Python, `httpx`, `APScheduler` | Async polling of NASA FIRMS REST API (VIIRS 375m feeds) with rate-limiting and checksum deduplication. |
| **Spatial Indexing** | Uber H3 (`h3-py`) | Hexagonal discrete global grid (Res-8, ~0.73 km²). Invariant area avoids standard lat/lon bounding box distortion. |
| **Spatial Database** | PostgreSQL 16 + PostGIS 3.4 | Stores OSM industrial footprints with R-Tree indexes; spatial joins execute in <10ms. |
| **Classification ML** | LightGBM, Scikit-learn | Gradient-boosted decision trees trained on multi-spectral brightness, FRP, TAI, persistence, and OSM distance metrics. |
| **Satellite Imagery** | Microsoft Planetary Computer STAC | Dynamic querying of Sentinel-2 Level-2A BOA reflectance tiles via STAC API without downloading multi-gigabyte scenes. |
| **Computer Vision** | PyTorch, Segment Anything (SAM) / YOLOv8 | Lightweight patch-level segmentation to isolate active burn scars, SWIR reflectance hotspots, and smoke plumes. |
| **Backend API** | FastAPI, Celery, Redis | Asynchronous task queue handles heavy STAC satellite image pulling and dispersion modeling without blocking telemetry streaming. |
| **Frontend & UI** | React.js, Deck.gl, Mapbox GL | Hardware-accelerated WebGL rendering for 100,000+ national thermal points, interactive 3D hex-bins, and vector plume layers. |
| **Atmospheric Model**| Open-Meteo API, SciPy | Computes Gaussian plume dispersion footprints using 10m real-time wind vectors and atmospheric stability classes. |

---

## 6. Repository Layout

```text
.
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST API routes (telemetry, anomalies, simulation, dispersion)
│   │   ├── core/            # App configuration & PostGIS database engine
│   │   ├── ml/              # Sub-5ms LightGBM classifier & feature extractor
│   │   ├── pipeline/        # Ingestion, H3 Res-8 spatial indexing, baseline SPF/TAI, dispersion
│   │   ├── tasks/           # Celery workers for Microsoft Planetary Computer STAC
│   │   └── main.py          # FastAPI application entrypoint
│   ├── tests/               # Unit tests (SPF, TAI, H3 binning, Plume model)
│   ├── Dockerfile           # Backend container image
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/                 # React 18 + TypeScript + Deck.gl + TailwindCSS dashboard
│   ├── package.json         # Frontend dependencies
│   └── vite.config.ts       # Vite bundler config
├── data/
│   └── scripts/             # FIRMS historical downloader & OSM polygon extractors
├── models/                  # Pre-trained models and ground-truth metadata
├── docker-compose.yml       # Orchestrates PostGIS 16, Redis, Backend, and Celery
├── .env.example             # Environment template
└── README.md
```

---

## 7. Quickstart Guide

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 18+ (for frontend development)

### 1. Environment Configuration
```bash
cp .env.example .env
# Edit .env and supply your NASA FIRMS map key and Mapbox token
```

### 2. Launch Infrastructure with Docker Compose
```bash
docker-compose up -d
```
This boots:
- PostgreSQL 16 + PostGIS 3.4 on `localhost:5432`
- Redis 7.2 on `localhost:6379`
- FastAPI Backend on `http://localhost:8000` (Swagger docs: `http://localhost:8000/docs`)
- Celery worker for Sentinel-2 STAC queries

### 3. Run Backend Locally (Alternative to Docker)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Run Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```

---

## 8. Judging Demonstration Script (Winning the Evaluation)

1. **Baseline Proof**: Open the dashboard over **Jamnagar Refinery**. Show how 5 active flares detected by FIRMS are categorized as *Normal Operational Flaring* with zero false alarms, backed by historical FRP baseline curves.
2. **The Incident Simulation**: Inject simulated FIRMS telemetry representing a major industrial explosion (e.g., an unexpected 120 MW thermal spike).
3. **Sub-Second Classification**: The LightGBM classifier triggers an instant **CRITICAL ACCIDENTAL FIRE** alert within 15 milliseconds ($\text{TAI} = +6.4\sigma$).
4. **Satellite Verification**: An automated Celery job fetches the corresponding Sentinel-2 SWIR/RGB composite, pinpointing the active combustion core in high-resolution infrared.
5. **Tactical Actionability**: Display the live toxic plume dispersion cone computed from real-time wind vectors, predicting downwind residential impact zones for civil defense dispatch.

---

## 9. License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
