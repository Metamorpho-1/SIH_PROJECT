"""
Satellite Patch Generation & STAC Ingestion Engine (Pipeline Stage 3)
Fetches or synthesizes multi-spectral Sentinel-2 Level-2A patches (64x64 pixels)
for high-resolution deep-learning verification of industrial anomalies.
"""
import io
import base64
import numpy as np
from PIL import Image
from typing import Dict, Any, Tuple
from app.ml.spectral_transforms import (
    build_multispectral_tensor,
    generate_rgb_composite,
    generate_swir_false_color
)

PATCH_SIZE = 64  # 64 x 64 pixels at 20m GSD corresponds to ~1.28 km x 1.28 km area

def generate_calibrated_patch(scenario_type: str = "explosion") -> Dict[str, Any]:
    """
    Generates a physically calibrated 64x64 Sentinel-2 multi-spectral scene.
    Scenarios:
      - 'explosion': Catastrophic industrial explosion & blazing storage tank (B12 saturated, NBR < -0.4, smoke plume).
      - 'routine_flare': Stationary refinery flare stack (localized single-point thermal emitter, normal background).
      - 'false_glare': Metal industrial roof / solar farm specular reflection (high visible + SWIR, NBR > 0).
      - 'ambient': Routine background industrial plant in thermal equilibrium.
    """
    rng = np.random.RandomState(42)
    h, w = PATCH_SIZE, PATCH_SIZE

    # Baseline background reflectance for industrial complex (concrete, roads, sparse grass)
    b02 = rng.normal(800, 50, (h, w)).clip(400, 1500)   # Blue
    b03 = rng.normal(1000, 60, (h, w)).clip(500, 1800)  # Green
    b04 = rng.normal(1100, 70, (h, w)).clip(600, 2000)  # Red
    b08 = rng.normal(2200, 150, (h, w)).clip(1200, 3500) # NIR
    b11 = rng.normal(1800, 120, (h, w)).clip(1000, 2800) # SWIR-1
    b12 = rng.normal(1400, 100, (h, w)).clip(800, 2200)  # SWIR-2

    # Center coordinates of the primary asset
    cy, cx = h // 2, w // 2

    if scenario_type == "explosion":
        # Catastrophic explosion & fire across an oil tank farm (~15-20 pixels)
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                dist = np.sqrt(dy**2 + dx**2)
                if dist <= 3.5:
                    intensity = np.exp(-dist / 2.0)
                    y, x = cy + dy, cx + dx
                    # Intense SWIR emission from combustion (>600K)
                    b12[y, x] += int(8500 * intensity)
                    b11[y, x] += int(5200 * intensity)
                    # Destruction of vegetation / severe negative NBR
                    b08[y, x] = int(b08[y, x] * (1.0 - 0.7 * intensity))
                    # Smoke / flame optical tint
                    b04[y, x] += int(3000 * intensity)
                    b03[y, x] += int(1500 * intensity)

        # Downwind smoke plume attenuation
        for step in range(1, 15):
            py = cy - step
            px = cx + int(step * 0.8)
            if 0 <= py < h and 0 <= px < w:
                b04[py, px] += 800  # Grayish-brown smoke
                b03[py, px] += 700
                b02[py, px] += 600

    elif scenario_type == "routine_flare":
        # Single-point stationary flare tip (1-2 pixels)
        b12[cy, cx] += 4200
        b11[cy, cx] += 2600
        b12[cy+1, cx] += 1800

    elif scenario_type == "false_glare":
        # Solar panels or metal rooftop: High optical reflectance across all channels, NBR not negative
        for dy in range(-2, 3):
            for dx in range(-4, 5):
                y, x = cy + dy, cx + dx
                b02[y, x] += 4000
                b03[y, x] += 4500
                b04[y, x] += 4800
                b08[y, x] += 5000
                b11[y, x] += 4200
                b12[y, x] += 4000

    # Build 6-channel normalized tensor
    tensor_6ch = build_multispectral_tensor(b12, b11, b08, b04, b03, b02)

    # Generate RGB and False-Color SWIR display composites
    rgb_img = generate_rgb_composite(b04, b03, b02)
    swir_img = generate_swir_false_color(b12, b08, b04)

    # Convert to Base64 PNG data URLs for REST transmission
    rgb_data_url = image_to_base64(rgb_img)
    swir_data_url = image_to_base64(swir_img)

    return {
        "scenario": scenario_type,
        "patch_dimensions": [h, w],
        "gsd_meters": 20.0,
        "tensor": tensor_6ch,
        "rgb_preview_url": rgb_data_url,
        "swir_preview_url": swir_data_url,
        "raw_bands": {
            "b12_swir2_mean": float(np.mean(b12)),
            "b12_swir2_max": float(np.max(b12)),
            "b08_nir_mean": float(np.mean(b08)),
            "nbr_min": float(np.min(tensor_6ch[5]))
        }
    }

def image_to_base64(img_array: np.ndarray) -> str:
    """Converts a (H, W, 3) uint8 numpy array to a base64 PNG data URI."""
    pil_img = Image.fromarray(img_array)
    # Upscale 64x64 to 256x256 using nearest neighbor for crisp UI inspection
    pil_img_upscaled = pil_img.resize((256, 256), Image.NEAREST)
    buffer = io.BytesIO()
    pil_img_upscaled.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"
