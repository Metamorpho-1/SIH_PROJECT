"""
Dynamic Baseline Modeling Engine
Formulates the Spatial Persistence Factor (SPF) and Fire Radiative Power Anomaly Index (TAI)
as defined in the NTRO SIH-26162 Technical Blueprint.
"""
from typing import Dict, Any, Optional

# Operational Thresholds
SPF_INDUSTRIAL_THRESHOLD: float = 0.35   # Persistent stationary emitter (flare/kiln)
SPF_AGRICULTURAL_THRESHOLD: float = 0.05 # Dispersed seasonal emitter (stubble)
TAI_ROUTINE_LIMIT: float = 2.5           # Routine flaring equilibrium upper bound
TAI_CRITICAL_THRESHOLD: float = 3.5      # Structural blaze / explosion trigger

def calculate_spf(hotspot_detections_count: int, total_overpasses: int = 90) -> float:
    """
    Computes the Spatial Persistence Factor (SPF) for an H3 cell:
    SPF(h) = (1 / T) * sum_{t=1}^T I(Hotspot_t in h)
    
    Args:
        hotspot_detections_count: Number of overpasses where a hotspot was detected in cell h.
        total_overpasses: Total temporal observation window (default: 90 overpasses / days).
    """
    if total_overpasses <= 0:
        return 0.0
    return min(1.0, max(0.0, float(hotspot_detections_count) / float(total_overpasses)))

def calculate_tai(frp_obs: float, mu_frp: float, sigma_frp: float, epsilon: float = 1e-4) -> float:
    """
    Computes the Fire Radiative Power Anomaly Index (TAI):
    TAI = (FRP_obs - mu_FRP(h)) / (sigma_FRP(h) + epsilon)
    
    Standardized Z-score of observed Fire Radiative Power against historical baseline.
    """
    return (float(frp_obs) - float(mu_frp)) / (float(sigma_frp) + epsilon)

def evaluate_thermal_state(spf: float, tai: float, is_in_osm_industrial: bool = False) -> Dict[str, Any]:
    """
    Heuristic rule evaluation comparing against baseline thresholds.
    """
    is_industrial_baseline = (spf >= SPF_INDUSTRIAL_THRESHOLD) or is_in_osm_industrial
    
    if is_industrial_baseline:
        if tai > TAI_CRITICAL_THRESHOLD:
            return {
                "status": "CRITICAL_ACCIDENTAL_FIRE",
                "class_id": 1,
                "action": "TRIGGER_SENTINEL2_PULL_AND_SOP_DISPATCH",
                "severity": "HIGH",
                "description": f"Abrupt thermal excursion detected in industrial zone (TAI = {tai:.2f}σ > {TAI_CRITICAL_THRESHOLD}σ)"
            }
        else:
            return {
                "status": "ROUTINE_INDUSTRIAL_ACTIVITY",
                "class_id": 0,
                "action": "SUPPRESS_ALARM_UPDATE_BASELINE",
                "severity": "LOW",
                "description": f"Thermal emission within routine flaring baseline (TAI = {tai:.2f}σ <= {TAI_ROUTINE_LIMIT}σ)"
            }
    else:
        if spf <= SPF_AGRICULTURAL_THRESHOLD:
            return {
                "status": "AGRICULTURAL_STUBBLE_BURNING",
                "class_id": 2,
                "action": "ROUTE_TO_SPCB",
                "severity": "MEDIUM",
                "description": "Transient low-persistence hotspot in non-industrial zone"
            }
        else:
            return {
                "status": "WILDFIRE_FOREST_FIRE",
                "class_id": 3,
                "action": "ROUTE_TO_FSI",
                "severity": "HIGH",
                "description": "Spatial sprawl hotspot in vegetative / forest sector"
            }
