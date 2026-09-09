"""
FastAPI router for live weather data.
"""
import asyncio
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List

from app.pipeline.weather import get_facility_weather
from app.pipeline.ingestion import DEMO_FACILITIES

router = APIRouter(prefix="/weather", tags=["Live Atmospheric Intelligence"])

@router.get("/current")
async def get_current_weather(facility: str = Query(..., description="The facility key")) -> Dict[str, Any]:
    """
    Returns the current live weather for the specified facility.
    """
    if facility not in DEMO_FACILITIES:
        raise HTTPException(status_code=404, detail=f"Facility {facility} not found")
    try:
        return await get_facility_weather(facility)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/all-facilities")
async def get_all_facilities_weather() -> List[Dict[str, Any]]:
    """
    Returns weather data for ALL facilities in parallel.
    """
    facilities = list(DEMO_FACILITIES.keys())
    tasks = [get_facility_weather(f) for f in facilities]
    try:
        results = await asyncio.gather(*tasks)
        return list(results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
