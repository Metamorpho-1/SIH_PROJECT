from typing import Dict, List, Optional

CHEMICAL_PROFILES = {
    "LPG_PROPANE": {
        "IDLH_ppm": 2100,
        "ERPG2_ppm": 5000,
        "ERPG1_ppm": 1000,
        "MW": 44.1,
        "boiling_point_C": -42,
        "hazard": "BLEVE fireball + thermal radiation",
        "emission_factor_g_s_per_m2": 0.15,
        "default_q_g_s": 800,
        "protective_actions": {
            "IDLH": "Evacuate immediately. Wear SCBA.",
            "ERPG2": "Shelter in place. Turn off HVAC.",
            "ERPG1": "Monitor for symptoms."
        },
        "color_code": "#FF4500" # OrangeRed
    },
    "BENZENE": {
        "IDLH_ppm": 500,
        "ERPG2_ppm": 150,
        "ERPG1_ppm": 25,
        "MW": 78.1,
        "boiling_point_C": 80,
        "hazard": "Carcinogenic aromatic vapor cloud",
        "emission_factor_g_s_per_m2": 0.12,
        "default_q_g_s": 600,
        "protective_actions": {
            "IDLH": "Immediate evacuation. Full PPE.",
            "ERPG2": "Shelter in place.",
            "ERPG1": "Health monitoring."
        },
        "color_code": "#8A2BE2" # BlueViolet
    },
    "CRUDE_OIL": {
        "IDLH_ppm": 1100,
        "ERPG2_ppm": 300,
        "ERPG1_ppm": 50,
        "MW": 170.0,
        "boiling_point_C": 200,
        "hazard": "PM2.5 soot + CO plume",
        "emission_factor_g_s_per_m2": 0.10,
        "default_q_g_s": 500,
        "protective_actions": {
            "IDLH": "Evacuate. Respiratory protection.",
            "ERPG2": "Limit outdoor activity.",
            "ERPG1": "Air quality advisory."
        },
        "color_code": "#2F4F4F" # DarkSlateGray
    },
    "HYDROGEN_SULFIDE": {
        "IDLH_ppm": 100,
        "ERPG2_ppm": 30,
        "ERPG1_ppm": 1,
        "MW": 34.1,
        "boiling_point_C": -60,
        "hazard": "Lethal neurotoxin",
        "emission_factor_g_s_per_m2": 0.08,
        "default_q_g_s": 400,
        "protective_actions": {
            "IDLH": "Immediate life-saving evacuation.",
            "ERPG2": "Shelter in place with sealed rooms.",
            "ERPG1": "Monitor area continuously."
        },
        "color_code": "#800080" # Purple
    },
    "AMMONIA": {
        "IDLH_ppm": 300,
        "ERPG2_ppm": 150,
        "ERPG1_ppm": 25,
        "MW": 17.0,
        "boiling_point_C": -33,
        "hazard": "Corrosive respiratory agent",
        "emission_factor_g_s_per_m2": 0.20,
        "default_q_g_s": 700,
        "protective_actions": {
            "IDLH": "Evacuate upwind. Chemical suits required.",
            "ERPG2": "Shelter in place.",
            "ERPG1": "Stay indoors."
        },
        "color_code": "#00CED1" # DarkTurquoise
    },
    "CHLORINE": {
        "IDLH_ppm": 10,
        "ERPG2_ppm": 3,
        "ERPG1_ppm": 1,
        "MW": 70.9,
        "boiling_point_C": -34,
        "hazard": "Pulmonary edema agent",
        "emission_factor_g_s_per_m2": 0.06,
        "default_q_g_s": 300,
        "protective_actions": {
            "IDLH": "Urgent evacuation. Gas masks mandatory.",
            "ERPG2": "Seek higher ground and shelter.",
            "ERPG1": "Close windows and doors."
        },
        "color_code": "#ADFF2F" # GreenYellow
    },
    "STYRENE": {
        "IDLH_ppm": 700,
        "ERPG2_ppm": 100,
        "ERPG1_ppm": 50,
        "MW": 104.2,
        "boiling_point_C": 145,
        "hazard": "CNS depressant vapor",
        "emission_factor_g_s_per_m2": 0.09,
        "default_q_g_s": 450,
        "protective_actions": {
            "IDLH": "Evacuate area.",
            "ERPG2": "Avoid exposure. Shelter in place.",
            "ERPG1": "Odor advisory."
        },
        "color_code": "#FFB6C1" # LightPink
    },
    "ETHYLENE_OXIDE": {
        "IDLH_ppm": 800,
        "ERPG2_ppm": 50,
        "ERPG1_ppm": 10,
        "MW": 44.1,
        "boiling_point_C": 10.7,
        "hazard": "Explosive + carcinogenic",
        "emission_factor_g_s_per_m2": 0.11,
        "default_q_g_s": 550,
        "protective_actions": {
            "IDLH": "Evacuate. Explosion hazard.",
            "ERPG2": "Shelter in place away from windows.",
            "ERPG1": "Monitor air."
        },
        "color_code": "#DC143C" # Crimson
    },
    "GENERIC": {
        "IDLH_ppm": 500,
        "ERPG2_ppm": 200,
        "ERPG1_ppm": 50,
        "MW": 100.0,
        "boiling_point_C": 100,
        "hazard": "Unknown industrial chemical",
        "emission_factor_g_s_per_m2": 0.10,
        "default_q_g_s": 500,
        "protective_actions": {
            "IDLH": "Evacuate as precaution.",
            "ERPG2": "Shelter in place.",
            "ERPG1": "Advisory alert."
        },
        "color_code": "#808080" # Gray
    }
}

FACILITY_CHEMICAL_MAP = {
    "jamnagar_refinery": ["LPG_PROPANE", "BENZENE", "CRUDE_OIL"],
    "iocl_paradip": ["CRUDE_OIL", "LPG_PROPANE", "BENZENE"],
    "ongc_mumbai_high": ["CRUDE_OIL", "HYDROGEN_SULFIDE"],
    "bhilai_steel_plant": ["AMMONIA", "STYRENE"],
    "tata_jamshedpur": ["AMMONIA", "CHLORINE"],
    "gail_pata": ["ETHYLENE_OXIDE", "LPG_PROPANE", "STYRENE"],
    "ntpc_singrauli": ["AMMONIA", "CRUDE_OIL"],
    "disaster_baghjan": ["CRUDE_OIL", "HYDROGEN_SULFIDE", "LPG_PROPANE"],
    "punjab_stubble_sample": ["GENERIC"]
}

def get_chemical_profile(chemical_type: str) -> Dict:
    """
    Retrieve the hazard profile for a given chemical.
    
    Args:
        chemical_type (str): The chemical identifier.
        
    Returns:
        Dict: The chemical profile including thresholds and protective actions.
    """
    return CHEMICAL_PROFILES.get(chemical_type.upper(), CHEMICAL_PROFILES["GENERIC"])

def get_facility_chemicals(facility_key: str) -> List[str]:
    """
    Retrieve the primary chemicals present at a given facility.
    
    Args:
        facility_key (str): The facility identifier.
        
    Returns:
        List[str]: A list of chemical types associated with the facility.
    """
    return FACILITY_CHEMICAL_MAP.get(facility_key, ["GENERIC"])

def compute_chemical_emission_rate(chemical_type: str, frp_mw: float, fire_area_m2: float) -> float:
    """
    Compute the emission rate (Q) in g/s based on chemical-specific factors.
    
    Args:
        chemical_type (str): The chemical identifier.
        frp_mw (float): Fire Radiative Power in Megawatts.
        fire_area_m2 (float): Estimated fire area in square meters.
        
    Returns:
        float: Estimated emission rate in g/s.
    """
    profile = get_chemical_profile(chemical_type)
    # Basic empirical model combining FRP and area with chemical emission factor
    # In reality, this would be a more complex thermodynamic model.
    q = (profile["emission_factor_g_s_per_m2"] * fire_area_m2) + (frp_mw * 0.5)
    return max(q, 10.0)
