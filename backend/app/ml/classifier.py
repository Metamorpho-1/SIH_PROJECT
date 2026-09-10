"""
LightGBM Multi-Class Triage Engine
Classifies incoming hotspot telemetry into 4 discrete operational taxonomy classes in <5ms.
"""
import time
import os
import logging
import joblib
import numpy as np
from typing import Dict, Any, Tuple
from app.ml.features import extract_features_from_telemetry

logger = logging.getLogger(__name__)

# Operational Taxonomy Matrix (Page 3 NTRO SIH-26162 Specification)
CLASSES = {
    0: {
        "tag": "CLASS 0",
        "category": "Routine Industrial Activity",
        "action": "SUPPRESS_ALARM",
        "action_details": "Suppress alarm; update rolling baseline distribution.",
        "routing_target": "INTERNAL_BASELINE_DB",
        "severity": "NORMAL"
    },
    1: {
        "tag": "CLASS 1",
        "category": "Accidental Industrial Fire / Explosion",
        "action": "CRITICAL_ALERT",
        "action_details": "Critical Alert: Trigger Sentinel-2 pull & SOP dispatch.",
        "routing_target": "NDRF_INDUSTRIAL_SAFETY_REGULATORS",
        "severity": "CRITICAL"
    },
    2: {
        "tag": "CLASS 2",
        "category": "Agricultural / Stubble Burning",
        "action": "ROUTE_POLLUTION_BOARD",
        "action_details": "Route to State Pollution Control Boards (SPCB).",
        "routing_target": "STATE_POLLUTION_CONTROL_BOARD",
        "severity": "ELEVATED"
    },
    3: {
        "tag": "CLASS 3",
        "category": "Wildfire / Forest Fire",
        "action": "ROUTE_FOREST_SURVEY",
        "action_details": "Route to Forest Survey of India (FSI) feeds.",
        "routing_target": "FOREST_SURVEY_OF_INDIA",
        "severity": "HIGH"
    }
}

class HotspotTriageClassifier:
    def __init__(self, model_path: str = None):
        if model_path is None:
            # Default to the generated aura_model_v1.pkl
            model_path = os.path.join(os.path.dirname(__file__), 'aura_model_v1.pkl')
            
        self.model_path = model_path
        self.model = None
        
        try:
            if os.path.exists(self.model_path):
                self.model = joblib.load(self.model_path)
                logger.info(f"Successfully loaded Scikit-Learn RandomForest model from {self.model_path}")
            else:
                logger.warning(f"Model file {self.model_path} not found. Falling back to heuristic rules.")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
    
    def predict(self, telemetry_record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes sub-5ms multi-class classification using the trained Random Forest model.
        """
        start_time = time.perf_counter()
        features = extract_features_from_telemetry(telemetry_record)
        
        if self.model is not None:
            # Prepare feature vector strictly matching train order: 
            # ['frp', 'bright_ti4', 'bright_ti5', 'delta_brightness', 'spf', 'tai', 'osm_industrial']
            X = np.array([[
                features["frp"],
                features["bright_ti4"],
                features["bright_ti5"],
                features["delta_brightness"],
                features["spf"],
                features["tai"],
                features["osm_industrial"]
            ]])
            
            # Predict
            predicted_class = int(self.model.predict(X)[0])
            probas = self.model.predict_proba(X)[0]
            confidence = float(probas[predicted_class])
        else:
            # Fallback heuristic rules
            spf = features["spf"]
            tai = features["tai"]
            bright_ti4 = features["bright_ti4"]
            osm_ind = features["osm_industrial"]
            
            if osm_ind > 0.5 or spf >= 0.35:
                if tai > 3.0 or (tai > 2.5 and bright_ti4 > 350.0):
                    predicted_class = 1
                    confidence = min(0.99, 0.85 + (tai - 3.0) * 0.03)
                else:
                    predicted_class = 0
                    confidence = 0.96
            else:
                if spf <= 0.05 and features["frp"] < 60.0:
                    predicted_class = 2
                    confidence = 0.92
                else:
                    predicted_class = 3
                    confidence = 0.89
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        class_meta = CLASSES[predicted_class]
        
        return {
            "class_id": predicted_class,
            "class_tag": class_meta["tag"],
            "category": class_meta["category"],
            "action": class_meta["action"],
            "action_details": class_meta["action_details"],
            "routing_target": class_meta["routing_target"],
            "severity": class_meta["severity"],
            "confidence": round(confidence, 4),
            "inference_time_ms": round(elapsed_ms, 3),
            "features": features
        }

# Global singleton instance
triage_classifier = HotspotTriageClassifier()
