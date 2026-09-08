from fastapi import APIRouter, Query
from typing import Dict, Any
from app.pipeline.dispersion import generate_plume_hazard_cone

router = APIRouter(prefix="/dispersion", tags=["Atmospheric Dispersion"])

@router.get("/plume", response_model=Dict[str, Any])
async def simulate_dispersion_plume(
    lat: float = Query(22.4707, description="Latitude of emission source"),
    lon: float = Query(69.8331, description="Longitude of emission source"),
    wind_speed: float = Query(4.5, description="10m wind speed in m/s"),
    wind_direction: float = Query(240.0, description="Wind direction (degrees, from)"),
    emission_rate: float = Query(500.0, description="Toxic release rate in g/s"),
    max_distance_km: float = Query(12.0, description="Downwind projection distance in km"),
    stability_class: str = Query("D", description="Pasquill-Gifford stability class (A-F)")
):
    """
    Simulates Gaussian toxic plume hazard polygon using 10m wind vectors for Deck.gl map overlay.
    """
    feature = generate_plume_hazard_cone(
        origin_lat=lat,
        origin_lon=lon,
        wind_speed_m_s=wind_speed,
        wind_direction_deg=wind_direction,
        emission_rate_g_s=emission_rate,
        max_downwind_km=max_distance_km,
        stability_class=stability_class
    )
    return feature
