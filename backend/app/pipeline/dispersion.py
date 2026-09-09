"""
Atmospheric Dispersion Simulation Engine: Gaussian Toxic Plume Model
Simulates chemical / toxic smoke plume propagation from industrial thermal excursions
using real-time 10m wind vectors and Pasquill-Gifford atmospheric stability classes.
"""
import math
import numpy as np
from typing import Dict, List, Any, Tuple

# Pasquill-Gifford dispersion parameters (Rural condition, Class D - Neutral default)
# sigma_y = a * x^b, sigma_z = c * x^d  (x in kilometers, sigma in meters)
STABILITY_COEFFICIENTS = {
    'A': {'a': 213, 'b': 0.894, 'c': 440.8, 'd': 1.941}, # Very unstable
    'B': {'a': 156, 'b': 0.894, 'c': 106.6, 'd': 1.149}, # Moderately unstable
    'C': {'a': 104, 'b': 0.894, 'c': 61.0,  'd': 0.911}, # Slightly unstable
    'D': {'a': 68,  'b': 0.894, 'c': 33.2,  'd': 0.725}, # Neutral (standard default)
    'E': {'a': 50.5,'b': 0.894, 'c': 22.8,  'd': 0.678}, # Slightly stable
    'F': {'a': 34,  'b': 0.894, 'c': 14.35, 'd': 0.740}  # Moderately stable
}

def calculate_dispersion_sigmas(distance_km: float, stability_class: str = 'D') -> Tuple[float, float]:
    """Computes lateral (sigma_y) and vertical (sigma_z) dispersion coefficients in meters."""
    params = STABILITY_COEFFICIENTS.get(stability_class.upper(), STABILITY_COEFFICIENTS['D'])
    d = max(0.05, distance_km)
    sigma_y = params['a'] * (d ** params['b'])
    sigma_z = params['c'] * (d ** params['d'])
    return sigma_y, sigma_z

def gaussian_ground_concentration(
    x_meters: float,
    y_meters: float,
    q_emission_rate_g_s: float,
    wind_speed_m_s: float,
    effective_stack_height_m: float = 25.0,
    stability_class: str = 'D'
) -> float:
    """
    Standard Gaussian Plume equation at ground-level (z=0):
    C(x, y, 0) = [Q / (pi * u * sigma_y * sigma_z)] * exp(-y^2 / (2 * sigma_y^2)) * exp(-H^2 / (2 * sigma_z^2))
    """
    if x_meters <= 0:
        return 0.0
    
    u = max(0.5, wind_speed_m_s)
    x_km = x_meters / 1000.0
    sigma_y, sigma_z = calculate_dispersion_sigmas(x_km, stability_class)
    
    lateral_term = math.exp(- (y_meters ** 2) / (2.0 * (sigma_y ** 2)))
    vertical_term = math.exp(- (effective_stack_height_m ** 2) / (2.0 * (sigma_z ** 2)))
    
    concentration = (q_emission_rate_g_s / (math.pi * u * sigma_y * sigma_z)) * lateral_term * vertical_term
    return concentration

def estimate_emission_rate_q(frp_mw: float, cnn_fire_area_m2: float = 0.0) -> float:
    """
    Computes dynamic toxic chemical / smoke emission rate Q (in grams/second)
    coupled directly with NASA FIRMS Fire Radiative Power and CNN combustion footprint.
    Q = (alpha * FRP_MW) + (beta * Area_m2)
    """
    frp_component = max(0.0, float(frp_mw)) * 8.5
    area_component = max(0.0, float(cnn_fire_area_m2)) * 0.08
    total_q = max(50.0, frp_component + area_component)
    return round(total_q, 2)

def generate_hazard_polygon(
    origin_lat: float,
    origin_lon: float,
    wind_direction_deg: float,
    max_dist_km: float,
    stability_class: str = 'D',
    lateral_factor: float = 2.15
) -> List[List[float]]:
    """Generates a single closed polygon coordinate array for a given downwind distance."""
    travel_heading_deg = (wind_direction_deg + 180.0) % 360.0
    travel_heading_rad = math.radians(travel_heading_deg)

    steps = 9
    distances_km = np.linspace(0.15, max_dist_km, steps).tolist()
    left_boundary = []
    right_boundary = []

    km_per_lat = 111.32
    km_per_lon = 111.32 * math.cos(math.radians(origin_lat))

    for dist_km in distances_km:
        sigma_y, _ = calculate_dispersion_sigmas(dist_km, stability_class)
        plume_width_km = (lateral_factor * sigma_y) / 1000.0

        center_dx_km = dist_km * math.sin(travel_heading_rad)
        center_dy_km = dist_km * math.cos(travel_heading_rad)

        perp_dx_km = math.cos(travel_heading_rad)
        perp_dy_km = -math.sin(travel_heading_rad)

        l_x = center_dx_km - (plume_width_km * perp_dx_km)
        l_y = center_dy_km - (plume_width_km * perp_dy_km)
        left_boundary.append([origin_lon + (l_x / km_per_lon), origin_lat + (l_y / km_per_lat)])

        r_x = center_dx_km + (plume_width_km * perp_dx_km)
        r_y = center_dy_km + (plume_width_km * perp_dy_km)
        right_boundary.append([origin_lon + (r_x / km_per_lon), origin_lat + (r_y / km_per_lat)])

    polygon_coords = [[origin_lon, origin_lat]] + left_boundary + list(reversed(right_boundary)) + [[origin_lon, origin_lat]]
    return polygon_coords

def generate_plume_hazard_cone(
    origin_lat: float,
    origin_lon: float,
    wind_speed_m_s: float = 4.5,
    wind_direction_deg: float = 240.0,
    emission_rate_g_s: float = 500.0,
    max_downwind_km: float = 12.0,
    stability_class: str = 'D',
    cnn_fire_area_m2: float = 0.0,
    frp_mw: float = 0.0
) -> Dict[str, Any]:
    """
    Computes a multi-tiered GeoJSON FeatureCollection with 3 concentric hazard contours:
      - Zone 1 (Red): Immediate Lethal Zone (IDLH)
      - Zone 2 (Orange): Toxic Evacuation Zone (ERPG-2)
      - Zone 3 (Yellow): Precautionary Advisory Zone (ERPG-1)
    """
    # Recalculate dynamic emission rate Q if FRP or CNN area provided
    if frp_mw > 0 or cnn_fire_area_m2 > 0:
        emission_rate_g_s = estimate_emission_rate_q(frp_mw, cnn_fire_area_m2)

    travel_heading_deg = (wind_direction_deg + 180.0) % 360.0

    # Scale zone reaches based on emission strength Q
    scale = math.sqrt(max(100.0, emission_rate_g_s) / 500.0)
    z1_reach_km = round(min(max_downwind_km * 0.35 * scale, max_downwind_km * 0.4), 2)
    z2_reach_km = round(min(max_downwind_km * 0.70 * scale, max_downwind_km * 0.75), 2)
    z3_reach_km = round(min(max_downwind_km * scale, max_downwind_km * 1.25), 2)

    z1_coords = generate_hazard_polygon(origin_lat, origin_lon, wind_direction_deg, z1_reach_km, stability_class, 1.8)
    z2_coords = generate_hazard_polygon(origin_lat, origin_lon, wind_direction_deg, z2_reach_km, stability_class, 2.15)
    z3_coords = generate_hazard_polygon(origin_lat, origin_lon, wind_direction_deg, z3_reach_km, stability_class, 2.5)

    features = [
        {
            "type": "Feature",
            "properties": {
                "zone_id": 3,
                "zone_name": "Zone 3 - Precautionary Advisory",
                "color": "#eab308", # Yellow
                "fill_color": [234, 179, 8, 50],
                "reach_km": z3_reach_km,
                "advisory": "Shelter indoors, close windows, turn off external HVAC intakes."
            },
            "geometry": {"type": "Polygon", "coordinates": [z3_coords]}
        },
        {
            "type": "Feature",
            "properties": {
                "zone_id": 2,
                "zone_name": "Zone 2 - Toxic Evacuation Corridor",
                "color": "#f97316", # Orange
                "fill_color": [249, 115, 22, 90],
                "reach_km": z2_reach_km,
                "advisory": "Mandatory civilian evacuation downwind perpendicular to wind heading."
            },
            "geometry": {"type": "Polygon", "coordinates": [z2_coords]}
        },
        {
            "type": "Feature",
            "properties": {
                "zone_id": 1,
                "zone_name": "Zone 1 - Immediate Lethal Threat",
                "color": "#ef4444", # Red
                "fill_color": [239, 68, 68, 140],
                "reach_km": z1_reach_km,
                "advisory": "CRITICAL HAZARD: Immediate respiratory threat; first responders require full SCBA."
            },
            "geometry": {"type": "Polygon", "coordinates": [z1_coords]}
        }
    ]

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "origin": [origin_lon, origin_lat],
            "wind_speed_m_s": wind_speed_m_s,
            "wind_direction_deg": wind_direction_deg,
            "travel_heading_deg": travel_heading_deg,
            "emission_rate_g_s": emission_rate_g_s,
            "stability_class": stability_class,
            "cnn_fire_area_m2": cnn_fire_area_m2,
            "frp_mw": frp_mw,
            "max_evacuation_radius_km": z2_reach_km
        }
    }

