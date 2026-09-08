"""
Unit Tests for AURA-Fire Mathematical Models & Algorithmic Triage
Executable with standard library unittest or pytest.
"""
import unittest
import math
from app.pipeline.baseline import calculate_spf, calculate_tai, evaluate_thermal_state
from app.pipeline.spatial_index import geo_to_h3
from app.pipeline.dispersion import generate_plume_hazard_cone
from app.ml.classifier import triage_classifier

class TestAuraFireModels(unittest.TestCase):

    def test_spatial_persistence_factor(self):
        """SPF should calculate ratio over T overpasses accurately."""
        # 54 detections over 90 days = 0.60 (High persistence industrial flare)
        spf_industrial = calculate_spf(54, total_overpasses=90)
        self.assertAlmostEqual(spf_industrial, 0.60, places=2)
        self.assertGreaterEqual(spf_industrial, 0.35)

        # 2 detections over 90 days = 0.022 (Transient stubble burn)
        spf_agri = calculate_spf(2, total_overpasses=90)
        self.assertAlmostEqual(spf_agri, 0.022, places=2)
        self.assertLessEqual(spf_agri, 0.05)

    def test_fire_radiative_power_anomaly_index(self):
        """TAI standardized Z-score computation: (FRP_obs - mu) / (sigma + eps)"""
        # Baseline: mean = 25.0 MW, std = 3.5 MW
        # Routine flare: 28.5 MW -> TAI = (28.5 - 25.0) / 3.5 = +1.0 sigma
        tai_normal = calculate_tai(28.5, mu_frp=25.0, sigma_frp=3.5)
        self.assertAlmostEqual(tai_normal, 1.0, places=2)

        # Catastrophic explosion: 145.0 MW -> TAI = (145.0 - 25.0) / 3.5 = +34.2 sigma
        tai_explosion = calculate_tai(145.0, mu_frp=25.0, sigma_frp=3.5)
        self.assertGreater(tai_explosion, 30.0)

    def test_lightgbm_triage_routine_flaring(self):
        """Routine industrial flare should be classified as Class 0 (Alarm Suppressed)."""
        telemetry = {
            "frp": 26.2,
            "bright_ti4": 322.0,
            "bright_ti5": 298.0,
            "baseline_frp_mean": 24.5,
            "baseline_frp_std": 3.8,
            "is_osm_industrial": True,
            "spf": 0.65
        }
        result = triage_classifier.predict(telemetry)
        self.assertEqual(result["class_id"], 0)
        self.assertEqual(result["action"], "SUPPRESS_ALARM")
        self.assertLess(result["inference_time_ms"], 10.0) # Sub-10ms triage requirement

    def test_lightgbm_triage_accidental_explosion(self):
        """Major thermal spike in industrial plant must trigger Class 1 (Critical Alert)."""
        telemetry = {
            "frp": 145.0, # 120MW spike over 25MW baseline
            "bright_ti4": 367.0,
            "bright_ti5": 305.0,
            "baseline_frp_mean": 24.5,
            "baseline_frp_std": 3.8,
            "is_osm_industrial": True,
            "spf": 0.65
        }
        result = triage_classifier.predict(telemetry)
        self.assertEqual(result["class_id"], 1)
        self.assertEqual(result["action"], "CRITICAL_ALERT")
        self.assertEqual(result["routing_target"], "NDRF_INDUSTRIAL_SAFETY_REGULATORS")
        self.assertLess(result["inference_time_ms"], 10.0)

    def test_gaussian_plume_generation(self):
        """Gaussian plume should produce a valid GeoJSON polygon oriented downwind."""
        plume = generate_plume_hazard_cone(
            origin_lat=22.4707,
            origin_lon=69.8331,
            wind_speed_m_s=4.5,
            wind_direction_deg=240.0
        )
        self.assertEqual(plume["type"], "Feature")
        self.assertEqual(plume["geometry"]["type"], "Polygon")
        coords = plume["geometry"]["coordinates"][0]
        self.assertGreater(len(coords), 10)
        # First and last coordinate must be identical to form closed polygon
        self.assertEqual(coords[0], coords[-1])

if __name__ == "__main__":
    unittest.main()
