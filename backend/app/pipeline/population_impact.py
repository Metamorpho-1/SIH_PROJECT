import math
from typing import Dict, List

FACILITY_DEMOGRAPHICS = {
    "jamnagar_refinery": {
        "density_per_km2": 350,
        "infrastructure": [
            {"type": "Hospital", "name": "GG Hospital Jamnagar", "distance_km": 5.8},
            {"type": "School", "name": "Kendriya Vidyalaya Jamnagar", "distance_km": 4.2},
            {"type": "Highway", "name": "NH-27 Rajkot-Jamnagar", "distance_km": 3.1},
            {"type": "Railway", "name": "Jamnagar Junction", "distance_km": 7.5}
        ]
    },
    "iocl_paradip": {
        "density_per_km2": 420,
        "infrastructure": [
            {"type": "Hospital", "name": "Paradip Port Trust Hospital", "distance_km": 3.0},
            {"type": "School", "name": "KV Paradip", "distance_km": 4.5},
            {"type": "Port", "name": "Paradip Port", "distance_km": 1.5},
            {"type": "Highway", "name": "NH-5A", "distance_km": 2.0}
        ]
    },
    "ongc_mumbai_high": {
        "density_per_km2": 0,
        "infrastructure": [
            {"type": "Platform", "name": "Mumbai High North", "distance_km": 2.5}
        ]
    },
    "bhilai_steel_plant": {
        "density_per_km2": 680,
        "infrastructure": [
            {"type": "Hospital", "name": "JLN Hospital Bhilai", "distance_km": 4.0},
            {"type": "School", "name": "DPS Bhilai", "distance_km": 3.5},
            {"type": "Railway", "name": "Bhilai Power House", "distance_km": 5.0},
            {"type": "Highway", "name": "NH-6", "distance_km": 2.5}
        ]
    },
    "tata_jamshedpur": {
        "density_per_km2": 520,
        "infrastructure": [
            {"type": "Hospital", "name": "Tata Main Hospital", "distance_km": 3.2},
            {"type": "University", "name": "NIT Jamshedpur", "distance_km": 6.0},
            {"type": "Railway", "name": "Tatanagar Junction", "distance_km": 4.5},
            {"type": "Highway", "name": "NH-33", "distance_km": 5.5}
        ]
    },
    "gail_pata": {
        "density_per_km2": 290,
        "infrastructure": [
            {"type": "Hospital", "name": "GAIL Hospital", "distance_km": 1.0},
            {"type": "School", "name": "KV GAIL Pata", "distance_km": 1.5},
            {"type": "Highway", "name": "NH-91", "distance_km": 4.0}
        ]
    },
    "ntpc_singrauli": {
        "density_per_km2": 180,
        "infrastructure": [
            {"type": "Hospital", "name": "NTPC Hospital", "distance_km": 2.0},
            {"type": "Village", "name": "Shaktinagar", "distance_km": 3.0},
            {"type": "Industrial", "name": "NCL Coal Fields", "distance_km": 5.0}
        ]
    },
    "disaster_baghjan": {
        "density_per_km2": 150,
        "infrastructure": [
            {"type": "Hospital", "name": "Tinsukia Civil Hospital", "distance_km": 12.0},
            {"type": "School", "name": "Baghjan Gaon School", "distance_km": 1.5},
            {"type": "River", "name": "Brahmaputra River", "distance_km": 4.0},
            {"type": "Highway", "name": "NH-37", "distance_km": 8.0}
        ]
    },
    "punjab_stubble_sample": {
        "density_per_km2": 440,
        "infrastructure": [
            {"type": "Hospital", "name": "District Hospital Sangrur", "distance_km": 6.0},
            {"type": "School", "name": "Govt School", "distance_km": 2.5},
            {"type": "Highway", "name": "NH-7", "distance_km": 3.0}
        ]
    }
}

def estimate_polygon_area_km2(polygon_coords: List[List[float]]) -> float:
    """
    Estimate the area of a polygon in square kilometers using the Shoelace formula on Earth's surface.
    Assumes coordinates are in [longitude, latitude].
    
    Args:
        polygon_coords: List of [lon, lat] coordinates representing the polygon vertices.
        
    Returns:
        float: Estimated area in square kilometers.
    """
    if not polygon_coords or len(polygon_coords) < 3:
        return 0.0

    # Earth radius in km
    R = 6371.0

    # Convert coordinates to radians
    coords_rad = [[math.radians(lon), math.radians(lat)] for lon, lat in polygon_coords]
    
    area = 0.0
    n = len(coords_rad)
    for i in range(n):
        lon1, lat1 = coords_rad[i]
        lon2, lat2 = coords_rad[(i + 1) % n]
        
        # Spherical excess formulation approximation for small areas
        area += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))

    area = abs(area * (R * R) / 4.0)
    return area

def estimate_population_impact(facility_key: str, plume_geojson: Dict) -> Dict:
    """
    Estimate the demographic impact of a chemical plume.
    
    Args:
        facility_key: Identifier of the facility.
        plume_geojson: GeoJSON FeatureCollection of the plume hazard zones.
        
    Returns:
        Dict: Demographic impact estimation report.
    """
    demographics = FACILITY_DEMOGRAPHICS.get(facility_key, {"density_per_km2": 100, "infrastructure": []})
    density = demographics["density_per_km2"]
    
    zone_impacts = []
    total_exposed = 0
    
    for feature in plume_geojson.get("features", []):
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        
        if geometry.get("type") == "Polygon":
            coords = geometry.get("coordinates", [[]])[0]
            area_km2 = estimate_polygon_area_km2(coords)
            
            exposed = int(area_km2 * density)
            total_exposed += exposed
            
            zone_id = props.get("zone", 3)
            
            if zone_id == 1:
                severity = "LETHAL"
                name = "Immediate Lethal Threat"
            elif zone_id == 2:
                severity = "SEVERE"
                name = "Toxic Evacuation"
            else:
                severity = "MODERATE"
                name = "Precautionary Advisory"
                
            zone_impacts.append({
                "zone_id": zone_id,
                "zone_name": name,
                "area_km2": round(area_km2, 2),
                "estimated_exposed": exposed,
                "severity": severity
            })
            
    # Simple heuristic to include infrastructure
    max_radius_km = 10.0 # Arbitrary max radius for consideration based on typical dispersion
    infra_at_risk = [i for i in demographics["infrastructure"] if i.get("distance_km", 0) <= max_radius_km]

    return {
        "facility_key": facility_key,
        "population_density_per_km2": density,
        "zone_impacts": zone_impacts,
        "total_estimated_exposed": total_exposed,
        "critical_infrastructure_at_risk": infra_at_risk
    }
