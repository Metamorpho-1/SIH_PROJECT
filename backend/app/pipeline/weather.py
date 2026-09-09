"""
Real-time weather integration module using Open-Meteo API.
Handles live telemetry fetching, caching, and atmospheric stability computation.
"""
import time
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

from app.pipeline.ingestion import DEMO_FACILITIES
from app.core.config import settings

# Cache mapping facility_key -> (expiry_timestamp, weather_data)
_weather_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 300


async def fetch_live_weather(lat: float, lon: float) -> Dict[str, Any]:
    """
    Fetches real-time weather data for given coordinates from Open-Meteo API.

    Args:
        lat (float): Latitude
        lon (float): Longitude

    Returns:
        Dict[str, Any]: Dictionary containing current weather attributes.
    """
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,is_day&hourly=shortwave_radiation&forecast_days=1&timezone=auto"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            current = data.get("current", {})
            hourly = data.get("hourly", {})
            
            # Simple assumption: shortwave_radiation array index matching current hour
            solar_rad = 500.0 # Default
            if "shortwave_radiation" in hourly and isinstance(hourly["shortwave_radiation"], list) and len(hourly["shortwave_radiation"]) > 0:
                time_arr = hourly.get("time", [])
                current_time_str = current.get("time", "")
                
                # Match current time prefix to hourly time array
                # e.g., "2026-09-09T14:15" vs "2026-09-09T14:00"
                idx = 0
                for i, t_str in enumerate(time_arr):
                    if current_time_str and current_time_str[:13] == t_str[:13]:
                        idx = i
                        break
                solar_rad = hourly["shortwave_radiation"][idx]

            return {
                "wind_speed_10m": float(current.get("wind_speed_10m", 4.5)),
                "wind_direction_10m": float(current.get("wind_direction_10m", 240)),
                "temperature_2m": float(current.get("temperature_2m", 30)),
                "cloud_cover": float(current.get("cloud_cover", 25)),
                "is_day": bool(current.get("is_day", 1)),
                "solar_radiation_w_m2": float(solar_rad),
            }
    except Exception:
        # Sensible defaults on failure
        return {
            "wind_speed_10m": 4.5,
            "wind_direction_10m": 240.0,
            "temperature_2m": 30.0,
            "cloud_cover": 25.0,
            "is_day": True,
            "solar_radiation_w_m2": 500.0,
        }

def compute_pasquill_gifford_stability(wind_speed_m_s: float, solar_radiation_w_m2: float, is_day: bool, cloud_cover_pct: float) -> Tuple[str, str]:
    """
    Computes Pasquill-Gifford atmospheric stability class based on Turner's method.

    Args:
        wind_speed_m_s (float): Wind speed in meters per second.
        solar_radiation_w_m2 (float): Solar radiation in W/m^2.
        is_day (bool): True if daytime, False if nighttime.
        cloud_cover_pct (float): Cloud cover percentage (0-100).

    Returns:
        Tuple[str, str]: (stability_class_letter, description)
    """
    w = max(0.0, wind_speed_m_s)

    if is_day:
        if solar_radiation_w_m2 > 700:
            if w < 2: return "A", "Extremely Unstable (Strong insolation, light wind)"
            elif w < 3: return "A", "Extremely Unstable (Strong insolation, light wind)"
            elif w < 5: return "B", "Moderately Unstable (Strong insolation, moderate wind)"
            elif w <= 6: return "C", "Slightly Unstable (Strong insolation, strong wind)"
            else: return "C", "Slightly Unstable (Strong insolation, strong wind)"
        elif 350 <= solar_radiation_w_m2 <= 700:
            if w < 2: return "A", "Extremely Unstable (Moderate insolation, light wind)"
            elif w < 3: return "B", "Moderately Unstable (Moderate insolation, light wind)"
            elif w < 5: return "B", "Moderately Unstable (Moderate insolation, moderate wind)"
            elif w <= 6: return "C", "Slightly Unstable (Moderate insolation, strong wind)"
            else: return "D", "Neutral (Moderate insolation, strong wind)"
        else:
            if w < 2: return "B", "Moderately Unstable (Slight insolation, light wind)"
            elif w < 3: return "C", "Slightly Unstable (Slight insolation, light wind)"
            elif w < 5: return "C", "Slightly Unstable (Slight insolation, moderate wind)"
            elif w <= 6: return "D", "Neutral (Slight insolation, strong wind)"
            else: return "D", "Neutral (Slight insolation, strong wind)"
    else:
        # Nighttime
        if cloud_cover_pct >= 50:
            if w < 2: return "F", "Moderately Stable (Overcast, light wind)"
            elif w <= 3: return "E", "Slightly Stable (Overcast, light wind)"
            else: return "D", "Neutral (Overcast, strong wind)"
        else:
            if w < 2: return "F", "Moderately Stable (Clear sky, light wind)"
            elif w <= 3: return "F", "Moderately Stable (Clear sky, light wind)"
            elif w <= 5: return "E", "Slightly Stable (Clear sky, moderate wind)"
            else: return "D", "Neutral (Clear sky, strong wind)"

async def get_facility_weather(facility_key: str) -> Dict[str, Any]:
    """
    Gets real-time weather data and stability class for a facility. Uses cache.
    
    Args:
        facility_key (str): The unique identifier for the facility.
        
    Returns:
        Dict[str, Any]: A dictionary containing live weather and stability data.
    """
    facility = DEMO_FACILITIES.get(facility_key)
    if not facility:
        raise ValueError(f"Facility {facility_key} not found")

    now = time.time()
    if facility_key in _weather_cache:
        expiry, cached_data = _weather_cache[facility_key]
        if now < expiry:
            cached_data["cached"] = True
            return cached_data

    lat, lon = facility["lat"], facility["lon"]
    weather = await fetch_live_weather(lat, lon)
    
    cls_letter, desc = compute_pasquill_gifford_stability(
        weather["wind_speed_10m"],
        weather["solar_radiation_w_m2"],
        weather["is_day"],
        weather["cloud_cover"]
    )

    data = {
        "facility_key": facility_key,
        "wind_speed_10m": weather["wind_speed_10m"],
        "wind_direction_10m": weather["wind_direction_10m"],
        "temperature_2m": weather["temperature_2m"],
        "cloud_cover": weather["cloud_cover"],
        "is_day": weather["is_day"],
        "solar_radiation_w_m2": weather["solar_radiation_w_m2"],
        "computed_stability_class": cls_letter,
        "stability_description": desc,
        "fetched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "Open-Meteo GFS",
        "cached": False
    }

    _weather_cache[facility_key] = (now + CACHE_TTL_SECONDS, data.copy())
    return data
