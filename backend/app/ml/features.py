"""
Feature Pipeline for Machine Learning Triage
Extracts multi-spectral brightness, FRP, standardized TAI, SPF, and OSM proximity metrics.
"""
from typing import Dict, Any, List
from app.pipeline.baseline import calculate_spf, calculate_tai

def extract_features_from_telemetry(record: Dict[str, Any]) -> Dict[str, float]:
    """
    Extracts numerical feature vector for LightGBM inference:
    - frp: Fire Radiative Power (MW)
    - bright_ti4: VIIRS 375m Band I4 brightness temperature (Kelvin)
    - bright_ti5: VIIRS 375m Band I5 thermal IR brightness temperature (Kelvin)
    - delta_brightness: (I4 - I5) spectral difference
    - spf: Spatial Persistence Factor over 90-day window
    - tai: Thermal Anomaly Index Z-score
    - osm_industrial: Indicator whether within OSM industrial polygon (1.0 or 0.0)
    """
    frp = float(record.get("frp", 0.0))
    bright_ti4 = float(record.get("bright_ti4", 300.0))
    bright_ti5 = float(record.get("bright_ti5", 290.0))
    delta_b = bright_ti4 - bright_ti5
    
    mean_frp = float(record.get("baseline_frp_mean", 0.0))
    std_frp = float(record.get("baseline_frp_std", 1.0))
    
    tai = calculate_tai(frp, mean_frp, std_frp)
    
    # Check if persistence factor or hotspot count was provided
    if "spf" in record:
        spf = float(record["spf"])
    else:
        # If in known demo industrial facility, high baseline SPF
        spf = 0.65 if record.get("is_osm_industrial") else 0.02
        
    osm_industrial = 1.0 if record.get("is_osm_industrial") else 0.0
    
    return {
        "frp": frp,
        "bright_ti4": bright_ti4,
        "bright_ti5": bright_ti5,
        "delta_brightness": delta_b,
        "spf": spf,
        "tai": tai,
        "osm_industrial": osm_industrial
    }
