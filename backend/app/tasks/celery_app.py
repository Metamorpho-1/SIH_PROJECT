"""
Celery Task Application Configuration
Orchestrates asynchronous STAC queries, heavy satellite image downloads,
and Gaussian plume simulations without blocking the main telemetry stream.
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "aura_fire_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.stac_worker", "app.tasks.celery_worker"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300, # 5 min limit per STAC verification task
)
