"""
Celery Worker Tasks
Handles asynchronous processing of heavy Multi-Spectral CNN verifications,
plume dispersion modeling, and Redis Pub/Sub broadcast for the WebSocket.
"""
import asyncio
import json
import logging
from typing import Dict, Any

from celery import shared_task
from app.ml.cnn_model import cnn_verifier
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.pipeline.dispersion import generate_plume_hazard_cone
from app.pipeline.chemical_profiles import get_chemical_profile, compute_chemical_emission_rate
from app.pipeline.population_impact import estimate_population_impact
from app.pipeline.ingestion import DEMO_FACILITIES
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

async def _publish_to_redis(channel: str, message: dict):
    redis = await get_redis()
    await redis.publish(channel, json.dumps(message))
    logger.info(f"Published task result to {channel}")

@shared_task(bind=True, name="app.tasks.celery_worker.verify_incident_async")
def verify_incident_async(self, telemetry: Dict[str, Any], classification: Dict[str, Any], weather: Dict[str, Any], chemical_type: str, xai_attributions: list):
    """
    Heavy task run by Celery worker.
    1. Runs the PyTorch CNN (mocked latency).
    2. Runs Gaussian plume math.
    3. Fires result back via Redis Pub/Sub.
    """
    import time
    logger.info(f"Started async verification for {telemetry['facility_name']}")
    
    # State 1: Acknowledged
    self.update_state(state='PROCESSING', meta={'step': 'Downloading Sentinel-2 B12/B8 High-Resolution Thermal Swath...', 'progress': 20})
    time.sleep(1.0)
    
    # State 2: Imagery Alignment
    self.update_state(state='PROCESSING', meta={'step': 'Performing Tensor Alignment & Atmospheric Correction...', 'progress': 40})
    time.sleep(0.5)
    
    # Stage 3: Deep-Learning Multi-Spectral CNN Verification
    self.update_state(state='PROCESSING', meta={'step': 'Running Aura-Fire Semantic Segmentation CNN...', 'progress': 60})
    time.sleep(1.5)
    
    facility_key = telemetry.get("facility_key", "jamnagar_refinery")
    explosion_patch = generate_calibrated_patch(scenario_type="explosion", facility_key=facility_key)
    cnn_results = cnn_verifier.predict(explosion_patch["tensor"])
    verified_area_m2 = cnn_results["fire_footprint"]["fire_area_m2"]
    
    from app.pipeline.descriptive_analysis import generate_spatial_impact_analysis
    cnn_results["descriptive_analysis"] = generate_spatial_impact_analysis(facility_key, chemical_type, verified_area_m2)
    
    # State 4: Plume & Dispatch
    self.update_state(state='PROCESSING', meta={'step': 'Calculating 3D Gaussian Plume & Population Impact...', 'progress': 85})
    time.sleep(0.5)
    
    facility = telemetry.get("facility_key", "jamnagar_refinery")
    wind_speed = weather.get("wind_speed_10m", 5.2)
    wind_direction = weather.get("wind_direction_10m", 235.0)
    stability = weather.get("computed_stability_class", "C")
    
    chem_profile = get_chemical_profile(chemical_type)
    chem_q = compute_chemical_emission_rate(chemical_type, telemetry["frp"], verified_area_m2)
    
    # Stage 4: Atmospheric Gaussian Toxic Plume Model
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
    pop_impact = estimate_population_impact(facility, plume)
    
    facility_data = DEMO_FACILITIES.get(facility, DEMO_FACILITIES["jamnagar_refinery"])
    jurisdiction = f"{facility_data.get('state', 'Unknown')} District Disaster Management Authority & NDRF"
    
    final_payload = {
        "type": "INCIDENT_ALERT",
        "scenario": "INCIDENT_SIMULATION_EXPLOSION",
        "facility": telemetry["facility_name"],
        "facility_key": facility,
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
        "demo_notes": f"ASYNC PROCESSING: Tier 1 Triage completed instantly. Tier 2 Node confirmed {verified_area_m2:,.0f} m² combustion via Spectral Analysis. Weather: {wind_speed} m/s @ {wind_direction}°."
    }
    
    # Easiest way in synchronous Celery without monkey-patching:
    asyncio.run(_publish_to_redis("tactical_alerts", final_payload))
    return {"status": "success", "facility": facility}
