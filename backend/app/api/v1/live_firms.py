from fastapi import APIRouter
import httpx
import logging
from typing import List, Dict, Any

router = APIRouter()
logger = logging.getLogger(__name__)

# Approximate bounding box for India
INDIA_BBOX = {
    "min_lat": 6.75,
    "max_lat": 37.1,
    "min_lon": 68.16,
    "max_lon": 97.4
}

@router.get("/live-firms", response_model=List[Dict[str, Any]])
async def get_live_firms_india():
    """Fetches public 24h Suomi NPP VIIRS active fire data for South Asia and filters for India."""
    url = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_24h.csv"
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            lines = response.text.strip().split("\n")
            if not lines:
                return []
                
            header = lines[0].split(",")
            
            records = []
            # Columns usually: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
            lat_idx = header.index("latitude") if "latitude" in header else 0
            lon_idx = header.index("longitude") if "longitude" in header else 1
            frp_idx = header.index("frp") if "frp" in header else 12
            conf_idx = header.index("confidence") if "confidence" in header else 9
            
            for line in lines[1:]:
                if not line.strip():
                    continue
                cols = line.split(",")
                try:
                    lat = float(cols[lat_idx])
                    lon = float(cols[lon_idx])
                    frp = float(cols[frp_idx])
                    conf = cols[conf_idx]
                    
                    # Basic bounding box filter for India
                    if INDIA_BBOX["min_lat"] <= lat <= INDIA_BBOX["max_lat"] and INDIA_BBOX["min_lon"] <= lon <= INDIA_BBOX["max_lon"]:
                        records.append({
                            "lat": lat,
                            "lon": lon,
                            "frp": frp,
                            "confidence": conf
                        })
                except (ValueError, IndexError):
                    continue
            
            return records
    except Exception as e:
        logger.error(f"Failed to fetch live FIRMS data: {e}")
        return []
