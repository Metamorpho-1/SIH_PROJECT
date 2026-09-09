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
    flare_patch = generate_calibrated_patch(scenario_type="routine_flare")
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
async def inject_jamnagar_incident(facility: str = "jamnagar_refinery", chemical_type: str = "GENERIC") -> Dict[str, Any]:
    """
    Step 2-5 of Judge Demo:
    Injects a 120 MW thermal explosion spike into telemetry.
    Sub-second LightGBM classifier triggers Class 1 alert.
    CNN confirms 8,400 m² combustion footprint and couples with Gaussian plume model.
    
    Now uses LIVE WEATHER from Open-Meteo API instead of hardcoded wind values,
    supports chemical-specific plume profiles, and computes population impact.
    """
    telemetry = get_simulated_telemetry(facility_key=facility, inject_spike=True)
    classification = triage_classifier.predict(telemetry)
    
    # Stage 3: Deep-Learning Multi-Spectral CNN Verification
    explosion_patch = generate_calibrated_patch(scenario_type="explosion")
    cnn_results = cnn_verifier.predict(explosion_patch["tensor"])
    verified_area_m2 = cnn_results["fire_footprint"]["fire_area_m2"]
    
    # Fetch LIVE weather from Open-Meteo (with graceful fallback)
    try:
        weather = await get_facility_weather(facility)
        wind_speed = weather.get("wind_speed_10m", 5.2)
        wind_direction = weather.get("wind_direction_10m", 235.0)
        stability = weather.get("computed_stability_class", "C")
    except Exception as e:
        logger.warning(f"Weather fetch failed for {facility}, using defaults: {e}")
        weather = {"wind_speed_10m": 5.2, "wind_direction_10m": 235.0, "computed_stability_class": "C", "source": "fallback"}
        wind_speed, wind_direction, stability = 5.2, 235.0, "C"
    
    # Chemical profile for emission rate calculation
    if chemical_type == "GENERIC":
        facility_chems = get_facility_chemicals(facility)
        chemical_type = facility_chems[0] if facility_chems else "GENERIC"
    
    chem_profile = get_chemical_profile(chemical_type)
    chem_q = compute_chemical_emission_rate(chemical_type, telemetry["frp"], verified_area_m2)
    
    # XAI SHAP Feature Attribution
    xai_attributions = compute_feature_attributions(telemetry, classification)
    
    # Stage 4: Atmospheric Gaussian Toxic Plume Model (coupled with CNN fire area + LIVE WIND)
    plume = generate_plume_hazard_cone(
        origin_lat=telemetry["latitude"],
        origin_lon=telemetry["longitude"],
        wind_speed_m_s=wind_speed,
        wind_direction_deg=wind_direction,
        emission_rate_g_s=chem_q,
        max_downwind_km=14.0,
        stability_class=stability,
        cnn_fire_area_m2=verified_area_m2,
        frp_mw=telemetry["frp"]
    )
    
    evac_radius = plume["properties"]["max_evacuation_radius_km"]
    
    # Population demographic impact estimation
    pop_impact = estimate_population_impact(facility, plume)
    
    # Facility jurisdiction lookup
    facility_data = DEMO_FACILITIES.get(facility, DEMO_FACILITIES["jamnagar_refinery"])
    jurisdiction = f"{facility_data.get('state', 'Unknown')} District Disaster Management Authority & NDRF"
    
    return {
        "scenario": "INCIDENT_SIMULATION_EXPLOSION",
        "facility": telemetry["facility_name"],
        "coordinates": {"lat": telemetry["latitude"], "lon": telemetry["longitude"]},
        "telemetry": telemetry,
        "triage_result": classification,
        "xai_feature_attributions": xai_attributions,
        "cnn_verification": cnn_results,
        "satellite_imagery": {
            "rgb_preview_url": explosion_patch["rgb_preview_url"],
            "swir_preview_url": explosion_patch["swir_preview_url"],
            "patch_dimensions": explosion_patch["patch_dimensions"],
            "gsd_meters": explosion_patch["gsd_meters"]
        },
        "chemical_profile": {
            "chemical_type": chemical_type,
            "name": chem_profile.get("name", chemical_type),
            "primary_hazard": chem_profile.get("hazard", "Unknown"),
            "idlh_ppm": chem_profile.get("IDLH_ppm", 500),
            "erpg2_ppm": chem_profile.get("ERPG2_ppm", 200),
            "computed_emission_rate_g_s": chem_q
        },
        "plume_dispersion": plume,
        "population_impact": pop_impact,
        "live_weather": weather,
        "ndrf_sop_dispatch": {
            "status": "DISPATCHED",
            "jurisdiction": jurisdiction,
            "alert_level": "LEVEL_3_RED",
            "evacuation_zone_km": evac_radius,
            "verified_fire_area_m2": verified_area_m2,
            "cnn_confidence_pct": round(cnn_results["confidence"] * 100, 1),
            "chemical_hazard": chem_profile.get("hazard", "Unknown"),
            "total_population_at_risk": pop_impact.get("total_estimated_exposed", 0)
        },
        "demo_notes": f"Tier 1 LightGBM classified in {classification['inference_time_ms']} ms (TAI = +{classification['features']['tai']:.1f}σ). Tier 2 CNN confirmed {verified_area_m2:,.0f} m² combustion core. Live wind: {wind_speed} m/s @ {wind_direction}° ({stability}). Chemical: {chemical_type}. Population at risk: {pop_impact.get('total_estimated_exposed', 0):,}."
    }
