"""
Interactive What-If Digital Twin Sandbox Endpoint
Allows real-time parameter adjustment (wind, chemical, FRP) with instant recalculation
of plume dispersion, population impact, and CNN verification.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any

from app.pipeline.ingestion import DEMO_FACILITIES, get_simulated_telemetry
from app.ml.classifier import triage_classifier
from app.ml.cnn_model import cnn_verifier
from app.pipeline.dispersion import generate_plume_hazard_cone
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.pipeline.chemical_profiles import get_chemical_profile, compute_chemical_emission_rate, get_facility_chemicals
from app.pipeline.population_impact import estimate_population_impact

router = APIRouter(prefix="/simulation", tags=["What-If Digital Twin Sandbox"])

class WhatIfRequest(BaseModel):
    facility: str = Field(default="jamnagar_refinery", description="Facility key from DEMO_FACILITIES")
    wind_speed_m_s: float = Field(default=12.5, description="Wind speed in m/s")
    wind_direction_deg: float = Field(default=180.0, description="Wind direction in degrees (0=North)")
    chemical_type: str = Field(default="BENZENE", description="Chemical released (e.g., BENZENE, AMMONIA)")
    explosion_frp_mw: float = Field(default=200.0, description="Fire Radiative Power of explosion in MW")
    stability_class: str = Field(default="B", description="Pasquill-Gifford stability class (A-F)")
    max_downwind_km: float = Field(default=14.0, description="Max plume projection distance in km")

@router.post("/what-if")
def simulate_what_if_scenario(req: WhatIfRequest) -> Dict[str, Any]:
    """
    Interactive What-If Digital Twin Sandbox.
    Recalculates plume, population impact, and triage in <20ms for real-time slider interaction.
    """
    facility = DEMO_FACILITIES.get(req.facility)
    if not facility:
        raise HTTPException(status_code=404, detail=f"Facility '{req.facility}' not found")
        
    # 1. Generate telemetry with explosion spike
    telemetry = get_simulated_telemetry(facility_key=req.facility, inject_spike=True)
    telemetry["frp"] = req.explosion_frp_mw  # Override FRP with what-if value
    
    # 2. Run Triage Classifier
    triage_result = triage_classifier.predict(telemetry)
    
    # 3. Run CNN Verification
    patch = generate_calibrated_patch(scenario_type="explosion")
    cnn_result = cnn_verifier.predict(patch["tensor"])
    verified_area_m2 = cnn_result["fire_footprint"]["fire_area_m2"]
    
    # 4. Get Chemical Profile
    chemical_profile = get_chemical_profile(req.chemical_type)
    
    # 5. Compute Chemical-Specific Emission Rate Q
    q_g_s = compute_chemical_emission_rate(req.chemical_type, req.explosion_frp_mw, verified_area_m2)
    
    # 6. Generate Plume Dispersion with user-specified wind parameters
    plume_geojson = generate_plume_hazard_cone(
        origin_lat=facility["lat"],
        origin_lon=facility["lon"],
        wind_speed_m_s=req.wind_speed_m_s,
        wind_direction_deg=req.wind_direction_deg,
        emission_rate_g_s=q_g_s,
        max_downwind_km=req.max_downwind_km,
        stability_class=req.stability_class,
        cnn_fire_area_m2=verified_area_m2,
        frp_mw=req.explosion_frp_mw
    )
    
    # 7. Compute Population Impact
    pop_impact = estimate_population_impact(req.facility, plume_geojson)
    
    return {
        "status": "success",
        "scenario_params": req.model_dump(),
        "facility_name": facility["name"],
        "coordinates": {"lat": facility["lat"], "lon": facility["lon"]},
        "triage_result": triage_result,
        "cnn_verification": cnn_result,
        "chemical_profile": {
            "chemical_type": req.chemical_type,
            "primary_hazard": chemical_profile.get("hazard", "Unknown"),
            "idlh_ppm": chemical_profile.get("IDLH_ppm", 500),
            "erpg2_ppm": chemical_profile.get("ERPG2_ppm", 200),
            "computed_emission_rate_g_s": q_g_s,
            "color_code": chemical_profile.get("color_code", "#FF4500")
        },
        "plume_dispersion": plume_geojson,
        "population_impact": pop_impact,
        "available_chemicals": get_facility_chemicals(req.facility)
    }
