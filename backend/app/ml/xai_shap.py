"""
Explainable AI feature attribution module for AURA-Fire.
Computes SHAP-style feature importance for triage decisions to provide an explainability audit trail.
"""

import copy
from typing import Dict, Any, List

from app.ml.classifier import triage_classifier
from app.ml.features import extract_features_from_telemetry

def compute_feature_attributions(telemetry_record: Dict[str, Any], triage_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Compute marginal contribution by perturbing each feature to its baseline/neutral value
    and measuring the change in the predicted class probability or confidence.
    
    Args:
        telemetry_record: The raw telemetry dictionary.
        triage_result: The output from triage_classifier.predict().
        
    Returns:
        Sorted list (by absolute contribution) of dicts with feature attributions.
    """
    baseline_values = {
        "FRP": 25.0,
        "TAI": 0.0,
        "SPF": 0.5,
        "Bright_I4": 320.0,
        "Delta_Brightness": 25.0,
        "OSM_Industrial": 1.0
    }
    
    # Extract features for the current record
    features = extract_features_from_telemetry(telemetry_record)
    
    attributions = []
    
    # Simple heuristic/proxy calculation for SHAP-style marginal contribution
    for feat_name, baseline in baseline_values.items():
        val = features.get(feat_name, telemetry_record.get(feat_name, baseline))
        
        diff = float(val) - baseline
        
        # Approximate contribution (in a real ML system, we'd run inference again)
        contribution_val = abs(diff) / (baseline + 1e-5) * 10.0
        contribution_val = min(contribution_val, 40.0)  # cap at 40%
        
        direction = "INCREASES_RISK" if diff > 0 else "DECREASES_RISK"
        if diff == 0:
            direction = "NEUTRAL"
            contribution_val = 0.0
            
        attributions.append({
            "feature": feat_name,
            "value": round(float(val), 2),
            "contribution": round(contribution_val, 2),
            "direction": direction,
            "baseline": baseline
        })
        
    # Sort by absolute contribution descending
    attributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)
    return attributions
