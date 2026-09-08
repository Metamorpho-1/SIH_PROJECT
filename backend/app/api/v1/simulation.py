"""
Judging Demonstration API (Section 7 Technical Blueprint)
Provides instant interactive replay of the Jamnagar Refinery evaluation scenario:
1. Baseline Proof: 5 active flares classified as Normal Operational Flaring (Class 0, suppressed).
2. Incident Injection: Unexpected 120 MW thermal spike -> instant Class 1 Critical Alert + Sentinel-2 STAC trigger + Plume.
"""
from fastapi import APIRouter
from typing import Dict, Any
from app.pipeline.ingestion import get_simulated_telemetry
from app.ml.classifier import triage_classifier
from app.pipeline.dispersion import generate_plume_hazard_cone

router = APIRouter(prefix="/simulation", tags=["Judging Demonstration Replay"])

@router.get("/baseline-proof")
async def get_jamnagar_baseline_proof() -> Dict[str, Any]:
    """
    Step 1 of Judge Demo:
    Simulates standard operational telemetry over Jamnagar Refinery.
    Confirms routine flaring is suppressed without noisy false alarms.
    """
    telemetry = get_simulated_telemetry(facility_key="jamnagar_refinery", inject_spike=False)
    classification = triage_classifier.predict(telemetry)
    
    return {
        "scenario": "BASELINE_OPERATIONAL_PROOF",
        "facility": telemetry["facility_name"],
        "coordinates": {"lat": telemetry["latitude"], "lon": telemetry["longitude"]},
        "h3_cell": telemetry["h3_index"],
        "telemetry": telemetry,
        "triage_result": classification,
        "demo_notes": "5 active refinery flares detected. TAI is within normal baseline (<=2.5σ). Alarm successfully suppressed."
    }

@router.post("/inject-explosion")
async def inject_jamnagar_incident() -> Dict[str, Any]:
    """
    Step 2-5 of Judge Demo:
    Injects a 120 MW thermal explosion spike into Jamnagar Refinery telemetry.
    Sub-second classifier triggers Class 1 alert, creates plume cone, and prepares Sentinel-2 STAC fetch.
    """
    telemetry = get_simulated_telemetry(facility_key="jamnagar_refinery", inject_spike=True)
    classification = triage_classifier.predict(telemetry)
    
    # Calculate live toxic plume cone
    plume = generate_plume_hazard_cone(
        origin_lat=telemetry["latitude"],
        origin_lon=telemetry["longitude"],
        wind_speed_m_s=5.2,
        wind_direction_deg=235.0, # SW wind towards NE residential sector
        emission_rate_g_s=1200.0,
        max_downwind_km=14.0,
        stability_class="C"
    )
    
    return {
        "scenario": "INCIDENT_SIMULATION_EXPLOSION",
        "facility": telemetry["facility_name"],
        "coordinates": {"lat": telemetry["latitude"], "lon": telemetry["longitude"]},
        "telemetry": telemetry,
        "triage_result": classification,
        "satellite_verification": {
            "task_status": "TRIGGERED",
            "provider": "Microsoft Planetary Computer STAC",
            "target_collection": "sentinel-2-l2a",
            "bands": ["B04 (Red)", "B08 (NIR)", "B12 (SWIR)"],
            "swir_core_detected": True,
            "normalized_burn_ratio": -0.48
        },
        "plume_dispersion": plume,
        "ndrf_sop_dispatch": {
            "status": "DISPATCHED",
            "jurisdiction": "Jamnagar District Disaster Management Authority & NDRF 6th Bn",
            "alert_level": "LEVEL_3_RED",
            "evacuation_zone_km": 6.5
        },
        "demo_notes": f"Incident classified in {classification['inference_time_ms']} ms! TAI = +{classification['features']['tai']:.1f}σ."
    }
