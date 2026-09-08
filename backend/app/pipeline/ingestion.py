"""
Telemetry Ingestion & Simulation Engine
Connects to NASA FIRMS REST API (VIIRS 375m feeds) and provides high-fidelity
simulation replays of industrial facilities (e.g. Jamnagar Refinery) for demonstration.
"""
import httpx
import logging
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.pipeline.spatial_index import geo_to_h3

logger = logging.getLogger(__name__)

# Jamnagar Refinery reference coordinates
JAMNAGAR_COORDS = {"lat": 22.4707, "lon": 69.8331}

# Historic Indian industrial demo facilities
DEMO_FACILITIES = {
    "jamnagar_refinery": {
        "name": "Reliance Jamnagar Refinery Complex",
        "lat": 22.4707,
        "lon": 69.8331,
        "baseline_frp_mean": 24.5,
        "baseline_frp_std": 3.8,
        "flares_count": 5,
        "h3_index": geo_to_h3(22.4707, 69.8331),
        "osm_industrial": True
    },
    "bhilai_steel_plant": {
        "name": "Bhilai Steel Plant (SAIL)",
        "lat": 21.1895,
        "lon": 81.3976,
        "baseline_frp_mean": 38.2,
        "baseline_frp_std": 5.1,
        "flares_count": 4,
        "h3_index": geo_to_h3(21.1895, 81.3976),
        "osm_industrial": True
    },
    "punjab_stubble_sample": {
        "name": "Sangrur Agricultural Field",
        "lat": 30.2458,
        "lon": 75.8421,
        "baseline_frp_mean": 0.0,
        "baseline_frp_std": 0.5,
        "flares_count": 0,
        "h3_index": geo_to_h3(30.2458, 75.8421),
        "osm_industrial": False
    }
}

async def fetch_firms_nrt_data(country_code: str = "IND", day_range: int = 1) -> List[Dict[str, Any]]:
    """Polls live NASA FIRMS API if key is present; returns empty list if unconfigured."""
    if not settings.NASA_FIRMS_MAP_KEY or settings.NASA_FIRMS_MAP_KEY == "your_nasa_firms_map_key_here":
        logger.info("NASA_FIRMS_MAP_KEY unconfigured; operating in simulation mode.")
        return []
    
    url = f"https://firms.modaps.eosdis.nasa.gov/api/country/csv/{settings.NASA_FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/{country_code}/{day_range}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        if response.status_code == 200:
            lines = response.text.strip().split("\n")
            header = lines[0].split(",")
            records = [dict(zip(header, line.split(","))) for line in lines[1:] if line]
            return records
        else:
            logger.error(f"FIRMS API query failed with status {response.status_code}")
            return []

def get_simulated_telemetry(facility_key: str = "jamnagar_refinery", inject_spike: bool = False) -> Dict[str, Any]:
    """
    Generates synthetic FIRMS VIIRS 375m detection record.
    If inject_spike is True, injects an unexpected 120 MW explosion spike.
    """
    facility = DEMO_FACILITIES.get(facility_key, DEMO_FACILITIES["jamnagar_refinery"])
    
    if inject_spike:
        frp_observed = 145.0  # Catastrophic explosion (120MW spike over 25MW baseline)
        brightness_temp_i4 = 368.5 # Severe saturation > 350K
    else:
        frp_observed = facility["baseline_frp_mean"] + 1.2 # Normal equilibrium flaring
        brightness_temp_i4 = 328.0 # Normal flaring range
    
    return {
        "facility_name": facility["name"],
        "latitude": facility["lat"],
        "longitude": facility["lon"],
        "h3_index": facility["h3_index"],
        "frp": frp_observed,
        "bright_ti4": brightness_temp_i4,
        "bright_ti5": 298.4,
        "confidence": "high",
        "acq_date": "2026-09-09",
        "acq_time": "1230",
        "satellite": "Suomi-NPP",
        "instrument": "VIIRS",
        "baseline_frp_mean": facility["baseline_frp_mean"],
        "baseline_frp_std": facility["baseline_frp_std"],
        "is_osm_industrial": facility["osm_industrial"]
    }
