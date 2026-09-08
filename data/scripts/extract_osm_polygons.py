"""
Data Foundation Script: OSM Industrial Infrastructure Extractor (Phase 1)
Queries Overpass API or extracts industrial polygons from Geofabrik India PBF
for indexing inside PostGIS (landuse=industrial, man_made=flare_stack).
"""
import os
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"

# Key Indian Industrial Hubs to preload
PRELOAD_HUBS = [
    {"name": "Jamnagar Refinery Complex", "lat": 22.4707, "lon": 69.8331, "radius_m": 8000},
    {"name": "Bhilai Steel Plant", "lat": 21.1895, "lon": 81.3976, "radius_m": 6000},
    {"name": "Nagothane Petrochemical Complex", "lat": 18.5285, "lon": 73.1362, "radius_m": 5000},
    {"name": "IOCL Paradip Refinery", "lat": 20.2829, "lon": 86.6190, "radius_m": 7000}
]

def generate_overpass_query_for_hub(lat: float, lon: float, radius_m: int) -> str:
    return f"""
    [out:json][timeout:30];
    (
      way["landuse"="industrial"](around:{radius_m},{lat},{lon});
      relation["landuse"="industrial"](around:{radius_m},{lat},{lon});
      node["man_made"="flare_stack"](around:{radius_m},{lat},{lon});
    );
    out body;
    >;
    out skel qt;
    """

def export_hub_manifest(output_path: str = "data/processed/industrial_hubs.json"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(PRELOAD_HUBS, f, indent=2)
    logger.info(f"Exported {len(PRELOAD_HUBS)} industrial hub definitions to {output_path}")

if __name__ == "__main__":
    export_hub_manifest()
