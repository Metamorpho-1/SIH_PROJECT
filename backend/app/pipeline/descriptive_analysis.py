def generate_spatial_impact_analysis(facility_key: str, chemical_type: str, area_m2: float) -> str:
    """Generates a dynamic tactical string describing the area affected."""
    area_hectares = area_m2 / 10000.0
    
    # Contextual facility definitions
    facility_contexts = {
        "jamnagar_refinery": "primary crude storage and distillation sectors",
        "iocl_paradip": "coastal refining infrastructure and loading docks",
        "ongc_mumbai_high": "offshore drilling platform structural supports",
        "bhilai_steel_plant": "blast furnace proximity zones and heavy metallurgy yards",
        "tata_jamshedpur": "heavy industrial manufacturing core",
        "gail_pata": "gas cracking and polymer storage units",
        "ntpc_singrauli": "super thermal power generation blocks",
        "disaster_baghjan": "high-pressure wellhead and surrounding wetland ecology",
        "punjab_stubble_sample": "agricultural grid and local road visibility"
    }
    
    context = facility_contexts.get(facility_key, "critical industrial infrastructure")
    
    # Size descriptors
    if area_hectares < 0.2:
        scale = "highly localized"
        damage = "isolated equipment damage"
    elif area_hectares < 1.0:
        scale = "contained but expanding"
        damage = "significant structural compromise"
    elif area_hectares < 5.0:
        scale = "major tactical"
        damage = "widespread facility destruction"
    else:
        scale = "catastrophic multi-zone"
        damage = "total sector collapse"

    chem_desc = ""
    if chemical_type != "GENERIC":
        chem_desc = f" The intense thermal event has triggered secondary {chemical_type} atmospheric venting, establishing a lethal dispersion vector downwind."

    analysis = (
        f"A {scale} {area_hectares:.1f}-hectare thermal footprint has been confirmed. "
        f"High-resolution spectral analysis indicates {damage} intersecting the {context}."
        f"{chem_desc} Immediate multi-tier evacuation perimeters must be enforced."
    )
    
    return analysis
