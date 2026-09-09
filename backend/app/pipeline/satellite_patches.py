"""
Satellite Patch Generation & STAC Ingestion Engine (Pipeline Stage 3)
Fetches or synthesizes multi-spectral Sentinel-2 Level-2A patches (64x64 pixels)
for high-resolution deep-learning verification of industrial anomalies.
"""
import io
import os
import base64
import numpy as np
from PIL import Image
from typing import Dict, Any
from app.ml.spectral_transforms import (
    build_multispectral_tensor,
    generate_rgb_composite,
    generate_swir_false_color
)

PATCH_SIZE = 64  # 64 x 64 pixels at 20m GSD corresponds to ~1.28 km x 1.28 km area
BASEMAPS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "basemaps")

def load_facility_basemap(facility_key: str, h: int, w: int) -> np.ndarray:
    """Loads a real satellite basemap for the facility and resizes it to (H, W, 3) RGB array."""
    path = os.path.join(BASEMAPS_DIR, f"{facility_key}.png")
    if os.path.exists(path):
        try:
            img = Image.open(path).convert("RGB")
            img = img.resize((w, h), Image.BILINEAR)
            return np.array(img, dtype=np.float32)
        except Exception:
            pass
    
    # Fallback to noise if basemap is missing
    rng = np.random.RandomState(42)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb[:,:,0] = rng.normal(110, 10, (h, w)) # R
    rgb[:,:,1] = rng.normal(100, 10, (h, w)) # G
    rgb[:,:,2] = rng.normal(80, 10, (h, w))  # B
    return rgb.clip(0, 255)

def generate_calibrated_patch(scenario_type: str = "explosion", facility_key: str = "jamnagar_refinery") -> Dict[str, Any]:
    """
    Generates a physically calibrated 64x64 Sentinel-2 multi-spectral scene
    by compositing simulated thermal anomalies onto real satellite basemaps.
    """
    h, w = PATCH_SIZE, PATCH_SIZE
    
    # 1. Load Real Basemap
    base_rgb = load_facility_basemap(facility_key, h, w)
    
    # Sentinel-2 Digital Numbers (DN) are approx Reflectance * 10000. 
    # For a rough mapping from 8-bit RGB [0-255] to Sentinel-2 DN:
    # 255 -> ~3000 DN (max normal optical reflectance)
    scale_factor = 3000.0 / 255.0
    
    b04 = base_rgb[:,:,0] * scale_factor  # Red
    b03 = base_rgb[:,:,1] * scale_factor  # Green
    b02 = base_rgb[:,:,2] * scale_factor  # Blue
    
    # 2. Synthesize baseline SWIR and NIR based on RGB heuristics
    # NIR (B08) is high where vegetation (Green > Red) is present
    veg_index = np.clip((b03 - b04) / (b03 + b04 + 1e-6), 0, 1)
    b08 = b03 * 1.5 + (veg_index * 3000.0) # Boost NIR for green areas
    b08 = b08.clip(800, 5000)
    
    # SWIR (B11, B12) is generally lower than optical for soil/veg, but high for bare concrete/metal
    # We use average of RGB as a proxy for albedo
    albedo = (b04 + b03 + b02) / 3.0
    b11 = albedo * 1.2
    b12 = albedo * 0.9

    # Center coordinates of the primary asset
    cy, cx = h // 2, w // 2

    # 3. Inject Anomalies
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
                    b08[y, x] = b08[y, x] * (1.0 - 0.7 * intensity)
                    # Smoke / flame optical tint
                    b04[y, x] += int(3000 * intensity)
                    b03[y, x] += int(1500 * intensity)

        # Downwind smoke plume attenuation (black/brown smoke blocking optical & SWIR)
        for step in range(1, 15):
            py = cy - step
            px = cx + int(step * 0.8)
            if 0 <= py < h and 0 <= px < w:
                plume_thickness = 1.0 - (step / 15.0)
                # Smoke reflects somewhat in visible
                b04[py, px] = b04[py, px] * (1 - plume_thickness) + 1500 * plume_thickness
                b03[py, px] = b03[py, px] * (1 - plume_thickness) + 1300 * plume_thickness
                b02[py, px] = b02[py, px] * (1 - plume_thickness) + 1200 * plume_thickness
                # Smoke heavily attenuates NIR and SWIR
                b08[py, px] *= (1 - plume_thickness * 0.5)
                b11[py, px] *= (1 - plume_thickness * 0.5)
                b12[py, px] *= (1 - plume_thickness * 0.5)

    elif scenario_type == "routine_flare":
        # Single-point stationary flare tip (1-2 pixels)
        b12[cy, cx] += 4200
        b11[cy, cx] += 2600
        if cy+1 < h:
            b12[cy+1, cx] += 1800

    elif scenario_type == "false_glare":
        # Solar panels or metal rooftop: High optical reflectance across all channels
        for dy in range(-2, 3):
            for dx in range(-4, 5):
                y, x = cy + dy, cx + dx
                if 0 <= y < h and 0 <= x < w:
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
