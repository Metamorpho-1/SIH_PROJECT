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
                    
                elif cmd == "inject_incident" and facility in DEMO_FACILITIES:
                    facility_info = DEMO_FACILITIES[facility]
                    
                    # Inject 120MW explosion event
                    incident_frp = 120.0
                    incident_bright = 345.0
                    
                    telemetry = {
                        "frp": incident_frp,
                        "bright_ti4": incident_bright,
                        "tai": round(calculate_tai(incident_frp, incident_bright) if callable(calculate_tai) else 0.8, 2),
                        "spf": round(calculate_spf(incident_frp) if callable(calculate_spf) else 0.9, 2)
                    }
                    
                    features = extract_features_from_telemetry(telemetry)
                    triage_result = triage_classifier.predict(features)
                    
                    # Generate patch and verify using CNN
                    patch = generate_calibrated_patch(
                        lat=facility_info.get("lat", 0.0),
                        lon=facility_info.get("lon", 0.0),
                        timestamp=datetime.now(timezone.utc).isoformat()
                    )
                    cnn_result = cnn_verifier(patch) if callable(cnn_verifier) else (getattr(cnn_verifier, "predict", None) or getattr(cnn_verifier, "verify", lambda x: {}))(patch)
                    
                    # Generate dispersion hazard cone
                    q_rate = estimate_emission_rate_q(incident_frp)
                    dispersion = generate_plume_hazard_cone(
                        lat=facility_info.get("lat", 0.0),
                        lon=facility_info.get("lon", 0.0),
                        q_rate=q_rate
                    )
                    
                    alert_msg = {
                        "type": "INCIDENT_ALERT",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "facility_key": facility,
                        "facility_name": facility_info.get("name", "Unknown Facility"),
                        "coordinates": {
                            "lat": facility_info.get("lat", 0.0),
                            "lon": facility_info.get("lon", 0.0)
                        },
                        "telemetry": telemetry,
                        "triage_result": triage_result,
                        "severity": "CRITICAL",
                        "scan_progress_pct": 100.0,
                        "cnn_verification": cnn_result,
                        "plume_dispersion": dispersion,
                        "ndrf_sop_dispatch": NDRF_SOP_DISPATCH
                    }
                    
                    await websocket.send_json(alert_msg)
            
            except WebSocketDisconnect:
                break
            except Exception:
                # Continue loop on invalid messages or parsing errors
                continue
                
    # Run both loops concurrently
    send_task = asyncio.create_task(send_telemetry_loop())
    recv_task = asyncio.create_task(receive_commands_loop())
    
    try:
        # Wait for either task to finish (e.g., via disconnect)
        done, pending = await asyncio.wait(
            [send_task, recv_task], 
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel any pending tasks
        for task in pending:
            task.cancel()
    except Exception:
        pass
