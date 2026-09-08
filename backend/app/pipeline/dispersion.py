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

def generate_plume_hazard_cone(
    origin_lat: float,
    origin_lon: float,
    wind_speed_m_s: float = 4.5,
    wind_direction_deg: float = 240.0, # Meteorological direction wind is coming FROM
    emission_rate_g_s: float = 500.0,
    max_downwind_km: float = 12.0,
    stability_class: str = 'D'
) -> Dict[str, Any]:
    """
    Computes geographical polygon contours representing downwind toxic concentration zones
    for rendering in Deck.gl / Mapbox.
    """
    # Downwind vector direction (wind blows toward direction = wind_dir + 180 mod 360)
    travel_heading_deg = (wind_direction_deg + 180.0) % 360.0
    travel_heading_rad = math.radians(travel_heading_deg)
    
    distances_km = [0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, max_downwind_km]
    left_boundary = []
    right_boundary = []
    
    # 1 deg latitude ~ 111.32 km, 1 deg longitude ~ 111.32 * cos(lat) km
    km_per_lat = 111.32
    km_per_lon = 111.32 * math.cos(math.radians(origin_lat))
    
    for dist_km in distances_km:
        sigma_y, _ = calculate_dispersion_sigmas(dist_km, stability_class)
        # Plume half-width at 2.15 sigma (10% of centerline concentration)
        plume_width_km = (2.15 * sigma_y) / 1000.0
        
        # Centerline point
        center_dx_km = dist_km * math.sin(travel_heading_rad)
        center_dy_km = dist_km * math.cos(travel_heading_rad)
        
        # Perpendicular normal vector for width
        perp_dx_km = math.cos(travel_heading_rad)
        perp_dy_km = -math.sin(travel_heading_rad)
        
        # Left boundary coordinate
        l_x = center_dx_km - (plume_width_km * perp_dx_km)
        l_y = center_dy_km - (plume_width_km * perp_dy_km)
        left_lat = origin_lat + (l_y / km_per_lat)
        left_lon = origin_lon + (l_x / km_per_lon)
        left_boundary.append([left_lon, left_lat])
        
        # Right boundary coordinate
        r_x = center_dx_km + (plume_width_km * perp_dx_km)
        r_y = center_dy_km + (plume_width_km * perp_dy_km)
        right_lat = origin_lat + (r_y / km_per_lat)
        right_lon = origin_lon + (r_x / km_per_lon)
        right_boundary.append([right_lon, right_lat])
    
    # Construct complete closed GeoJSON Polygon
    polygon_coords = [[origin_lon, origin_lat]] + left_boundary + list(reversed(right_boundary)) + [[origin_lon, origin_lat]]
    
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [polygon_coords]
        },
        "properties": {
            "origin": [origin_lon, origin_lat],
            "wind_speed_m_s": wind_speed_m_s,
            "wind_direction_deg": wind_direction_deg,
            "travel_heading_deg": travel_heading_deg,
            "max_distance_km": max_downwind_km,
            "stability_class": stability_class,
            "emission_rate_g_s": emission_rate_g_s
        }
    }
