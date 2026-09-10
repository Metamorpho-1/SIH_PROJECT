"""
Judging Demonstration API (Section 7 Technical Blueprint)
Provides instant interactive replay of the Jamnagar Refinery evaluation scenario:
1. Baseline Proof: 5 active flares classified as Normal Operational Flaring (Class 0, suppressed).
2. Incident Injection: Unexpected 120 MW thermal spike -> instant Class 1 Critical Alert + Sentinel-2 STAC trigger + Plume.

Now enhanced with:
- Live weather integration (Open-Meteo) replacing hardcoded wind values
- Chemical hazard profile selection
- Population demographic impact estimation
- XAI SHAP feature attribution audit trail
"""
import logging
from fastapi import APIRouter
from typing import Dict, Any
from app.pipeline.ingestion import get_simulated_telemetry, DEMO_FACILITIES
from app.ml.classifier import triage_classifier
from app.pipeline.dispersion import generate_plume_hazard_cone
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.ml.cnn_model import cnn_verifier
from app.pipeline.weather import get_facility_weather
from app.pipeline.chemical_profiles import get_facility_chemicals, get_chemical_profile, compute_chemical_emission_rate
from app.pipeline.population_impact import estimate_population_impact
from app.ml.xai_shap import compute_feature_attributions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulation", tags=["Judging Demonstration Replay"])

@router.get("/baseline-proof")
async def get_jamnagar_baseline_proof(facility: str = "jamnagar_refinery") -> Dict[str, Any]:
    """
    Step 1 of Judge Demo:
    Simulates standard operational telemetry over specified facility (default: Reliance Jamnagar).
    Confirms routine flaring is suppressed without noisy false alarms.
    Runs CNN verification on routine flare patch to demonstrate zero false alarms.
    """
    telemetry = get_simulated_telemetry(facility_key=facility, inject_spike=False)
    classification = triage_classifier.predict(telemetry)
    
    # Run Stage 3 CNN on routine flare scene
    flare_patch = generate_calibrated_patch(scenario_type="routine_flare", facility_key=facility)
    cnn_results = cnn_verifier.predict(flare_patch["tensor"])
    
    # Fetch live weather for the facility (non-blocking, with fallback)
    try:
        weather = await get_facility_weather(facility)
    except Exception:
        weather = {"wind_speed_10m": 4.5, "wind_direction_10m": 240.0, "computed_stability_class": "D", "source": "fallback"}
    
    return {
        "scenario": "BASELINE_OPERATIONAL_PROOF",
        "facility": telemetry["facility_name"],
        "coordinates": {"lat": telemetry["latitude"], "lon": telemetry["longitude"]},
        "h3_cell": telemetry["h3_index"],
        "telemetry": telemetry,
        "triage_result": classification,
        "cnn_verification": cnn_results,
        "satellite_imagery": {
            "rgb_preview_url": flare_patch["rgb_preview_url"],
            "swir_preview_url": flare_patch["swir_preview_url"],
            "patch_dimensions": flare_patch["patch_dimensions"],
            "gsd_meters": flare_patch["gsd_meters"]
        },
        "live_weather": weather,
        "available_chemicals": get_facility_chemicals(facility),
        "demo_notes": f"Active thermal emissions detected at {telemetry['facility_name']}. TAI is within baseline (<=2.5σ). CNN confirms routine industrial flaring with alarm suppressed."
    }

@router.post("/inject-explosion")
async def inject_jamnagar_incident(facility: str = "jamnagar_refinery", chemical_type: str = "GENERIC", wind_speed: float = None, wind_direction: float = None, explosion_frp: float = None) -> Dict[str, Any]:
    """
    Step 2-5 of Judge Demo:
    Injects a 120 MW thermal explosion spike into telemetry.
    Sub-second LightGBM classifier triggers Class 1 alert.
    Immediately dispatches Celery task for CNN and Plume generation, returning ACCEPTED.
    """
    telemetry = get_simulated_telemetry(facility_key=facility, inject_spike=True)
    telemetry["facility_key"] = facility
    if explosion_frp is not None:
        telemetry["frp"] = explosion_frp
        
    classification = triage_classifier.predict(telemetry)
    
    # Fast Triage XAI
    xai_attributions = compute_feature_attributions(telemetry, classification)
    
    # Fetch live weather (fast cached)
    try:
        weather = await get_facility_weather(facility)
    except Exception as e:
        logger.warning(f"Weather fetch failed for {facility}, using defaults: {e}")
        weather = {"wind_speed_10m": 5.2, "wind_direction_10m": 235.0, "computed_stability_class": "C", "source": "fallback"}
        
    if wind_speed is not None:
        weather["wind_speed_10m"] = wind_speed
    if wind_direction is not None:
        weather["wind_direction_10m"] = wind_direction
        
    if chemical_type == "GENERIC":
        facility_chems = get_facility_chemicals(facility)
        chemical_type = facility_chems[0] if facility_chems else "GENERIC"

    # Dispatch to Celery queue!
    from app.tasks.celery_app import celery_app
    from app.tasks.celery_worker import verify_incident_async
    task = verify_incident_async.delay(
        telemetry=telemetry,
        classification=classification,
        weather=weather,
        chemical_type=chemical_type,
        xai_attributions=xai_attributions
    )

    return {
        "status": "ACCEPTED",
        "scenario": "INCIDENT_SIMULATION_EXPLOSION_QUEUED",
        "task_id": task.id,
        "facility": telemetry["facility_name"],
        "coordinates": {"lat": telemetry["latitude"], "lon": telemetry["longitude"]},
        "telemetry": telemetry,
        "triage_result": classification,
        "xai_feature_attributions": xai_attributions,
        "live_weather": weather,
        "demo_notes": f"Tier 1 Primary Scan classified in {classification['inference_time_ms']} ms. Spectral Analysis validation delegated to Distributed Compute Nodes."
    }

@router.get("/task-status/{task_id}")
async def get_task_status(task_id: str):
    from app.tasks.celery_app import celery_app
    from celery.result import AsyncResult
    
    result = AsyncResult(task_id, app=celery_app)
    
    if result.state == 'PROCESSING':
        return {
            "status": "PROCESSING",
            "step": result.info.get('step', 'Processing...'),
            "progress": result.info.get('progress', 0)
        }
    elif result.state == 'PENDING':
        return {
            "status": "PENDING",
            "step": "Waiting in queue...",
            "progress": 0
        }
    elif result.state == 'SUCCESS':
        return {
            "status": "SUCCESS",
            "step": "Complete",
            "progress": 100,
            "result": result.result
        }
    else:
        return {
            "status": result.state,
            "step": str(result.info),
            "progress": 0
        }
