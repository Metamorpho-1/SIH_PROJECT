"""
Spatio-Temporal Indexing Engine: Uber H3 Discrete Global Grid (Resolution 8)
Resolution 8 produces hexagonal cells with ~461m edge length and ~0.737 km² area,
matching the spatial footprint of VIIRS 375m pixels.
"""
from typing import Tuple, List, Dict, Any

try:
    import h3
except ImportError:
    h3 = None

H3_RESOLUTION: int = 8

def geo_to_h3(lat: float, lon: float, res: int = H3_RESOLUTION) -> str:
    """Converts a (latitude, longitude) coordinate to an H3 hexadecimal index."""
    if h3 is None:
        # Fallback pseudo-hash for testing without compiled C-bindings
        return f"88{abs(int(lat*100)):04x}{abs(int(lon*100)):04x}ffff"
    
    # h3-py v4 uses lat_lng_to_cell, v3 used geo_to_h3
    if hasattr(h3, 'lat_lng_to_cell'):
        return h3.lat_lng_to_cell(lat, lon, res)
    elif hasattr(h3, 'geo_to_h3'):
        return h3.geo_to_h3(lat, lon, res)
    raise AttributeError("Incompatible h3 version")

def h3_to_geo(h3_index: str) -> Tuple[float, float]:
    """Converts an H3 index to its centroid (latitude, longitude)."""
    if h3 is None:
        return (0.0, 0.0)
    
    if hasattr(h3, 'cell_to_lat_lng'):
        return h3.cell_to_lat_lng(h3_index)
    elif hasattr(h3, 'h3_to_geo'):
        return h3.h3_to_geo(h3_index)
    raise AttributeError("Incompatible h3 version")

def h3_to_boundary(h3_index: str) -> List[Tuple[float, float]]:
    """Returns boundary coordinates of the hexagonal cell."""
    if h3 is None:
        return []
    
    if hasattr(h3, 'cell_to_boundary'):
        return h3.cell_to_boundary(h3_index)
    elif hasattr(h3, 'h3_to_geo_boundary'):
        return h3.h3_to_geo_boundary(h3_index)
    raise AttributeError("Incompatible h3 version")
