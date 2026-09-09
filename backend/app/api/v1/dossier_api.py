"""
FastAPI router for the NDRF Flash Dossier Generator feature.
Provides endpoints to generate the incident dossier in PDF and JSON formats.
"""

import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any

from app.pipeline.dossier import generate_incident_dossier_pdf, generate_incident_dossier_json

router = APIRouter(prefix="/dossier", tags=["Incident Dossier & XAI Explainability"])

class DossierRequest(BaseModel):
    facility: str
    scenario: str = "structural_explosion"

@router.post("/generate")
def generate_dossier_pdf(request: DossierRequest):
    """
    Generate and return a defense-formatted incident report PDF.
    """
    pdf_bytes = generate_incident_dossier_pdf(request.facility, request.scenario)
    return StreamingResponse(
        io.BytesIO(pdf_bytes), 
        media_type='application/pdf',
        headers={"Content-Disposition": f"attachment; filename=dossier_{request.facility}.pdf"}
    )

@router.post("/generate-json")
def generate_dossier_json(request: DossierRequest) -> Dict[str, Any]:
    """
    Generate and return the incident dossier data in JSON format.
    """
    return generate_incident_dossier_json(request.facility, request.scenario)
