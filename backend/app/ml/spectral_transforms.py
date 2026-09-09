"""
Sentinel-2 Multi-Spectral Tensor Preprocessing and Transformations (Pipeline Stage 3)
Normalizes Bottom-Of-Atmosphere (BOA) Level-2A reflectance bands and computes
specialized spectral indices (NBR, SWIR-anomaly, NDVI) for deep learning CNN triage.
"""
import numpy as np
from typing import Dict, Any, Tuple, Optional

# Sentinel-2 Band Names & Canonical Indices in our 6-channel tensor
# Channel 0: B12 (SWIR-2, 2190 nm)
# Channel 1: B11 (SWIR-1, 1610 nm)
# Channel 2: B08 (NIR, 842 nm)
# Channel 3: B04 (Red, 665 nm)
# Channel 4: B03 (Green, 560 nm)
# Channel 5: NBR (Normalized Burn Ratio: (B08 - B12) / (B08 + B12))

BAND_INDEX_MAP = {
    "B12": 0,
    "B11": 1,
    "B08": 2,
    "B04": 3,
    "B03": 4,
    "NBR": 5
}

REFLECTANCE_SCALE = 10000.0  # Sentinel-2 L2A BOA digital number scale factor

def compute_normalized_burn_ratio(b08: np.ndarray, b12: np.ndarray, epsilon: float = 1e-6) -> np.ndarray:
    """
    Computes Normalized Burn Ratio (NBR):
    NBR = (B08 - B12) / (B08 + B12 + epsilon)
    Values:
      -1.0 to -0.1 : Active high-temperature combustion core / severe burn
      -0.1 to +0.1 : Bare soil / low vegetation
      +0.1 to +0.8 : Healthy green vegetation
    """
    numerator = b08.astype(np.float32) - b12.astype(np.float32)
    denominator = b08.astype(np.float32) + b12.astype(np.float32) + epsilon
    return np.clip(numerator / denominator, -1.0, 1.0)

def compute_ndvi(b08: np.ndarray, b04: np.ndarray, epsilon: float = 1e-6) -> np.ndarray:
    """
    Computes Normalized Difference Vegetation Index (NDVI):
    NDVI = (B08 - B04) / (B08 + B04 + epsilon)
    """
    numerator = b08.astype(np.float32) - b04.astype(np.float32)
    denominator = b08.astype(np.float32) + b04.astype(np.float32) + epsilon
    return np.clip(numerator / denominator, -1.0, 1.0)

def normalize_reflectance(band_data: np.ndarray) -> np.ndarray:
    """Scales raw Sentinel-2 DN [0, 10000+] to [0.0, 1.0], clipping outliers at 1.5."""
    scaled = band_data.astype(np.float32) / REFLECTANCE_SCALE
    return np.clip(scaled, 0.0, 1.5)

def build_multispectral_tensor(
    b12: np.ndarray,
    b11: np.ndarray,
    b08: np.ndarray,
    b04: np.ndarray,
    b03: np.ndarray,
    b02: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Constructs a standardized 6-channel float32 tensor of shape (6, H, W).
    Channels:
      0: B12 (SWIR-2 normalized)
      1: B11 (SWIR-1 normalized)
      2: B08 (NIR normalized)
      3: B04 (Red normalized)
      4: B03 (Green normalized)
      5: NBR (Normalized Burn Ratio: -1.0 to +1.0)
    """
    b12_norm = normalize_reflectance(b12)
    b11_norm = normalize_reflectance(b11)
    b08_norm = normalize_reflectance(b08)
    b04_norm = normalize_reflectance(b04)
    b03_norm = normalize_reflectance(b03)
    nbr = compute_normalized_burn_ratio(b08_norm, b12_norm)

    tensor = np.stack([b12_norm, b11_norm, b08_norm, b04_norm, b03_norm, nbr], axis=0)
    return tensor.astype(np.float32)

def generate_rgb_composite(b04: np.ndarray, b03: np.ndarray, b02: np.ndarray) -> np.ndarray:
    """
    Produces a true-color (RGB) uint8 image of shape (H, W, 3) suitable for display.
    """
    r = np.clip(b04 / 3000.0, 0, 1) * 255.0
    g = np.clip(b03 / 3000.0, 0, 1) * 255.0
    b = np.clip(b02 / 3000.0, 0, 1) * 255.0
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return rgb

def generate_swir_false_color(b12: np.ndarray, b08: np.ndarray, b04: np.ndarray) -> np.ndarray:
    """
    Produces a SWIR false-color composite (B12-B08-B04) uint8 image of shape (H, W, 3).
    Active fires and explosions glow bright orange/red/yellow, while vegetation is vibrant green.
    """
    r = np.clip(b12 / 4000.0, 0, 1) * 255.0  # High SWIR -> Red channel
    g = np.clip(b08 / 3500.0, 0, 1) * 255.0  # High NIR -> Green channel
    b = np.clip(b04 / 3000.0, 0, 1) * 255.0  # Red -> Blue channel
    swir = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return swir
