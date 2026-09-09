"""
Unit Tests for AuraFireMultiSpectralCNN & Stage 3 Verification Pipeline
Executable via standard unittest or pytest.
"""
import unittest
import time
import numpy as np
from app.ml.spectral_transforms import (
    compute_normalized_burn_ratio,
    compute_ndvi,
    build_multispectral_tensor
)
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.ml.cnn_model import cnn_verifier
from app.pipeline.dispersion import estimate_emission_rate_q, generate_plume_hazard_cone

class TestMultiSpectralCNNPipeline(unittest.TestCase):

    def test_normalized_burn_ratio_physics(self):
        """NBR = (B08 - B12) / (B08 + B12). Should be strongly negative for fires."""
        # Active fire: B12 is very high (e.g. 0.8), B08 is low (e.g. 0.1)
        b08_fire = np.array([[0.10]], dtype=np.float32)
        b12_fire = np.array([[0.80]], dtype=np.float32)
        nbr_fire = compute_normalized_burn_ratio(b08_fire, b12_fire)
        self.assertLess(nbr_fire[0, 0], -0.6)

        # Green vegetation: B08 is high (e.g. 0.6), B12 is low (e.g. 0.1)
        b08_veg = np.array([[0.60]], dtype=np.float32)
        b12_veg = np.array([[0.10]], dtype=np.float32)
        nbr_veg = compute_normalized_burn_ratio(b08_veg, b12_veg)
        self.assertGreater(nbr_veg[0, 0], 0.5)

    def test_multispectral_tensor_shape_and_scaling(self):
        """Ensure 6-channel tensor is constructed accurately."""
        patch = generate_calibrated_patch("explosion")
        tensor = patch["tensor"]
        self.assertEqual(tensor.shape, (6, 64, 64))
        self.assertEqual(tensor.dtype, np.float32)

        # Channel 0 (B12) should be scaled [0, 1.5]
        self.assertGreaterEqual(tensor[0].min(), 0.0)
        self.assertLessEqual(tensor[0].max(), 1.5)

        # Channel 5 (NBR) should be within [-1.0, 1.0]
        self.assertGreaterEqual(tensor[5].min(), -1.0)
        self.assertLessEqual(tensor[5].max(), 1.0)

    def test_cnn_explosion_verification(self):
        """Catastrophic explosion must be confirmed with extensive combustion footprint."""
        patch = generate_calibrated_patch("explosion")
        result = cnn_verifier.predict(patch["tensor"])

        self.assertEqual(result["prediction_class"], "VERIFIED_ACCIDENTAL_EXPLOSION_OR_MAJOR_BLAZE")
        self.assertTrue(result["is_verified_fire"])
        self.assertGreater(result["confidence"], 0.95)
        self.assertGreater(result["fire_footprint"]["fire_area_m2"], 4000.0)
        self.assertGreater(result["fire_footprint"]["active_pixel_count"], 8)
        self.assertEqual(result["action"], "CONFIRM_CRITICAL_ACCIDENT_AND_DISPATCH")

    def test_cnn_routine_flare_suppression(self):
        """Stationary refinery flare stack must be identified and suppressed."""
        patch = generate_calibrated_patch("routine_flare")
        result = cnn_verifier.predict(patch["tensor"])

        self.assertEqual(result["prediction_class"], "VERIFIED_ROUTINE_FLARE_OR_CONTROLLED_EMISSION")
        self.assertFalse(result["is_verified_fire"])
        self.assertGreater(result["confidence"], 0.90)
        self.assertEqual(result["action"], "SUPPRESS_ROUTINE_EMISSION")

    def test_cnn_false_glare_rejection(self):
        """Optical specular reflection from solar panels / metal roofs must be dismissed."""
        patch = generate_calibrated_patch("false_glare")
        result = cnn_verifier.predict(patch["tensor"])

        self.assertEqual(result["prediction_class"], "FALSE_ALARM_OPTICAL_GLARE")
        self.assertFalse(result["is_verified_fire"])
        self.assertEqual(result["action"], "DISMISS_FALSE_ALARM")
        self.assertGreater(result["confidence"], 0.90)

    def test_dynamic_emission_rate_q_coupling(self):
        """Dynamic source strength Q must scale with both FRP and CNN fire footprint."""
        # Small flare: 25 MW, 0 m2 area
        q_small = estimate_emission_rate_q(frp_mw=25.0, cnn_fire_area_m2=0.0)
        self.assertEqual(q_small, 212.5)

        # 120 MW explosion with 8,400 m2 CNN combustion area
        q_major = estimate_emission_rate_q(frp_mw=145.0, cnn_fire_area_m2=8400.0)
        # 145 * 8.5 + 8400 * 0.08 = 1232.5 + 672 = 1904.5
        self.assertEqual(q_major, 1904.5)
        self.assertGreater(q_major, q_small * 8.0)

    def test_multi_tier_hazard_plume_generation(self):
        """Gaussian plume must generate 3 nested concentric zones scaled by Q."""
        plume = generate_plume_hazard_cone(
            origin_lat=22.4707,
            origin_lon=69.8331,
            cnn_fire_area_m2=8400.0,
            frp_mw=145.0
        )
        self.assertEqual(plume["type"], "FeatureCollection")
        self.assertEqual(len(plume["features"]), 3)
        # Zone 1 (Lethal) must have smaller reach than Zone 2 (Evacuation) and Zone 3 (Advisory)
        z1_reach = plume["features"][2]["properties"]["reach_km"]
        z2_reach = plume["features"][1]["properties"]["reach_km"]
        z3_reach = plume["features"][0]["properties"]["reach_km"]
        self.assertLess(z1_reach, z2_reach)
        self.assertLess(z2_reach, z3_reach)

    def test_cnn_inference_latency(self):
        """CNN forward inference on (6, 64, 64) tensor must complete within 25 ms."""
        patch = generate_calibrated_patch("explosion")
        tensor = patch["tensor"]

        # Warmup
        cnn_verifier.predict(tensor)

        times = []
        for _ in range(10):
            start = time.perf_counter()
            cnn_verifier.predict(tensor)
            times.append((time.perf_counter() - start) * 1000.0)

        avg_ms = np.mean(times)
        self.assertLess(avg_ms, 25.0, f"Average latency was {avg_ms:.2f} ms")

if __name__ == "__main__":
    unittest.main()
