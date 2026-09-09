import asyncio
import json
import random
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Existing module imports
from app.pipeline.ingestion import DEMO_FACILITIES
from app.pipeline.dispersion import generate_plume_hazard_cone, estimate_emission_rate_q
from app.pipeline.baseline import calculate_tai, calculate_spf
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.ml.classifier import triage_classifier
from app.ml.cnn_model import cnn_verifier
from app.ml.features import extract_features_from_telemetry

router = APIRouter(tags=["Live Tactical WebSocket Feed"])

# Define SOP response for NDRF
NDRF_SOP_DISPATCH = {
    "action": "IMMEDIATE_DEPLOYMENT",
    "teams_required": 3,
    "equipment": ["HAZMAT_SUITS", "FOAM_TENDERS", "AERIAL_RECON"],
    "eta_minutes": 15
}

@router.websocket("/ws/tactical-feed")
async def tactical_feed_websocket(websocket: WebSocket):
    """
    Live WebSocket Tactical Event Stream for AURA-Fire.
    Accepts WebSocket connections from the React frontend, runs a background async loop 
    streaming telemetry events, and handles commands for focus and incident injection.
    """
    await websocket.accept()
    
    start_time = time.time()
    last_heartbeat = time.time()
    
    facility_keys = list(DEMO_FACILITIES.keys())
    current_facility_idx = 0
    focused_facility: Optional[str] = None
    
    # Background task for sending telemetry data
    async def send_telemetry_loop():
        nonlocal current_facility_idx, last_heartbeat
        scan_progress_pct = 0.0
        
        while True:
            try:
                now = time.time()
                # Send Heartbeat every 10 seconds
                if now - last_heartbeat >= 10:
                    heartbeat_msg = {
                        "type": "HEARTBEAT",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "uptime_seconds": int(now - start_time)
                    }
                    await websocket.send_json(heartbeat_msg)
                    last_heartbeat = now
                
                # Determine which facility to scan
                if focused_facility and focused_facility in DEMO_FACILITIES and random.random() < 0.7:
                    # 70% chance to scan the focused facility if set
                    facility_key = focused_facility
                else:
                    if len(facility_keys) > 0:
                        facility_key = facility_keys[current_facility_idx]
                        current_facility_idx = (current_facility_idx + 1) % len(facility_keys)
                    else:
                        facility_key = "unknown_facility"
                
                facility_info = DEMO_FACILITIES.get(facility_key, {})
                
                # Generate natural background thermal readings
                # Assuming baseline FRP is ~ 5.0 with stddev 1.5
                base_frp = max(0.1, random.gauss(5.0, 1.5))
                base_bright = max(290.0, random.gauss(300.0, 5.0))
                
                telemetry = {
                    "frp": round(base_frp, 2),
                    "bright_ti4": round(base_bright, 2),
                    "tai": round(calculate_tai(base_frp, base_bright) if callable(calculate_tai) else 0.2, 2),
                    "spf": round(calculate_spf(base_frp) if callable(calculate_spf) else 0.5, 2)
                }
                
                features = extract_features_from_telemetry(telemetry)
                triage_result = triage_classifier.predict(features)
                
                scan_progress_pct = (scan_progress_pct + 5.5) % 100.0
                
                scan_msg = {
                    "type": "THERMAL_SCAN",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "facility_key": facility_key,
                    "facility_name": facility_info.get("name", "Unknown Facility"),
                    "coordinates": {
                        "lat": facility_info.get("lat", 0.0),
                        "lon": facility_info.get("lon", 0.0)
                    },
                    "telemetry": telemetry,
                    "triage_result": triage_result,
                    "severity": "NORMAL",
                    "scan_progress_pct": round(scan_progress_pct, 1)
                }
                
                await websocket.send_json(scan_msg)
                
                # Sleep for 2-4 seconds
                await asyncio.sleep(random.uniform(2.0, 4.0))
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                # In production we would log this. Breaking loop on fatal errors.
                break

    # Background task for subscribing to Redis Celery events
    async def redis_subscription_loop():
        from app.core.redis_client import get_redis
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe("tactical_alerts")
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    await websocket.send_json(data)
        except asyncio.CancelledError:
            await pubsub.unsubscribe("tactical_alerts")
            
    # Background task for receiving frontend commands
    async def receive_commands_loop():
        nonlocal focused_facility
        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                
                cmd = msg.get("cmd")
                facility = msg.get("facility")
                
                if cmd == "set_facility_focus" and facility:
                    focused_facility = facility
                    
            except WebSocketDisconnect:
                break
            except Exception:
                continue
                
    # Run loops concurrently
    send_task = asyncio.create_task(send_telemetry_loop())
    recv_task = asyncio.create_task(receive_commands_loop())
    redis_task = asyncio.create_task(redis_subscription_loop())
    
    try:
        done, pending = await asyncio.wait(
            [send_task, recv_task, redis_task], 
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except Exception:
        pass
