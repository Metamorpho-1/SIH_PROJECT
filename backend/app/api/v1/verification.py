"""
Sentinel-2 High-Resolution Multi-Spectral Verification API (Pipeline Stage 3)
Provides deep-learning CNN inference on Sentinel-2 SWIR/optical imagery
to verify active combustion cores and reject false alarms.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.ml.cnn_model import cnn_verifier

router = APIRouter(prefix="/verification", tags=["Stage 3: Deep-Learning CNN Verification"])

class CNNVerificationRequest(BaseModel):
    scenario: str = "explosion"
    latitude: Optional[float] = 22.4707
    longitude: Optional[float] = 69.8331

@router.get("/satellite-patch")
async def get_satellite_patch_preview(
    scenario: str = Query("explosion", description="Scenario: 'explosion', 'routine_flare', 'false_glare'")
) -> Dict[str, Any]:
    """
    Returns high-resolution Sentinel-2 RGB composite and SWIR false-color preview data URLs
    along with spectral band statistics.
    """
    patch = generate_calibrated_patch(scenario_type=scenario)
    return {
        "scenario": patch["scenario"],
        "patch_dimensions": patch["patch_dimensions"],
        "gsd_meters": patch["gsd_meters"],
        "rgb_preview_url": patch["rgb_preview_url"],
        "swir_preview_url": patch["swir_preview_url"],
        "raw_bands": patch["raw_bands"]
    }

@router.post("/cnn-verify")
async def run_cnn_verification(payload: CNNVerificationRequest) -> Dict[str, Any]:
    """
    Executes AuraFireMultiSpectralCNN inference on a Sentinel-2 multi-spectral scene.
    Outputs:
      - Combustion core classification (Explosion vs Routine Flare vs False Glare)
      - Active fire area in m² and hectares
      - False alarm rejection confidence
      - RGB and SWIR false-color composite previews
    """
    patch = generate_calibrated_patch(scenario_type=payload.scenario)
    cnn_results = cnn_verifier.predict(patch["tensor"])

    return {
        "scenario": payload.scenario,
        "coordinates": {"lat": payload.latitude, "lon": payload.longitude},
        "cnn_verification": cnn_results,
        "satellite_imagery": {
            "rgb_preview_url": patch["rgb_preview_url"],
            "swir_preview_url": patch["swir_preview_url"],
            "patch_dimensions": patch["patch_dimensions"],
            "gsd_meters": patch["gsd_meters"]
        }
    }
