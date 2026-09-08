from fastapi import APIRouter, Query
from typing import List, Dict, Any
from app.pipeline.ingestion import fetch_firms_nrt_data, DEMO_FACILITIES
from app.pipeline.spatial_index import geo_to_h3

router = APIRouter(prefix="/telemetry", tags=["Telemetry & Ingestion"])

@router.get("/facilities", response_model=Dict[str, Any])
async def list_monitored_facilities():
    """Lists indexed industrial facilities with baseline FRP statistics."""
    return DEMO_FACILITIES

@router.get("/firms/nrt", response_model=List[Dict[str, Any]])
async def get_live_firms_detections(country: str = Query("IND", description="ISO country code")):
    """Fetches near-real-time thermal detections from NASA FIRMS."""
    records = await fetch_firms_nrt_data(country_code=country)
    return records
