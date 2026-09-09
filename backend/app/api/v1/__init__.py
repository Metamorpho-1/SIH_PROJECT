from fastapi import APIRouter
from app.api.v1.telemetry import router as telemetry_router
from app.api.v1.anomalies import router as anomalies_router
from app.api.v1.dispersion import router as dispersion_router
from app.api.v1.simulation import router as simulation_router
from app.api.v1.verification import router as verification_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(telemetry_router)
api_v1_router.include_router(anomalies_router)
api_v1_router.include_router(dispersion_router)
api_v1_router.include_router(simulation_router)
api_v1_router.include_router(verification_router)

