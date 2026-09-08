from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.ml.classifier import triage_classifier
from app.pipeline.baseline import calculate_tai, calculate_spf

router = APIRouter(prefix="/anomalies", tags=["Anomaly & ML Triage"])

class HotspotEvaluationRequest(BaseModel):
    latitude: float
    longitude: float
    frp: float
    bright_ti4: float = 320.0
    bright_ti5: float = 295.0
    baseline_frp_mean: float = 24.5
    baseline_frp_std: float = 3.8
    is_osm_industrial: bool = True
    spf: Optional[float] = None

@router.post("/evaluate")
async def evaluate_hotspot(payload: HotspotEvaluationRequest):
    """
    Sub-5ms multi-class triage endpoint. Evaluates incoming hotspot against
    facility baseline FRP and classifies into Classes 0-3.
    """
    record = payload.model_dump()
    result = triage_classifier.predict(record)
    return result
