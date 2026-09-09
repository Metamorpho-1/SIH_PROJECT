"""
PDF dossier generator using reportlab. 
Creates a defense-formatted incident report PDF and JSON payload for the NDRF Flash Dossier feature.
"""

import io
import uuid
import datetime
from typing import Dict, Any

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from app.pipeline.ingestion import DEMO_FACILITIES, get_simulated_telemetry
from app.ml.classifier import triage_classifier
from app.pipeline.satellite_patches import generate_calibrated_patch
from app.ml.cnn_model import cnn_verifier
from app.pipeline.dispersion import generate_plume_hazard_cone
from app.ml.xai_shap import compute_feature_attributions

def generate_incident_dossier_json(facility_key: str, scenario: str = "structural_explosion") -> Dict[str, Any]:
    """
    Run the full pipeline and generate a JSON dossier structure.
    """
    facility = DEMO_FACILITIES.get(facility_key, DEMO_FACILITIES["jamnagar_refinery"])
    
    # Run the full pipeline
    telemetry = get_simulated_telemetry(facility_key, inject_spike=True)
    triage_result = triage_classifier.predict(telemetry)
    
    patch = generate_calibrated_patch("explosion")
    cnn_result = cnn_verifier.predict(patch["tensor"])
    verified_area_m2 = cnn_result["fire_footprint"]["fire_area_m2"]
    
    dispersion = generate_plume_hazard_cone(
        origin_lat=facility["lat"],
        origin_lon=facility["lon"],
        wind_speed_m_s=5.2,
        wind_direction_deg=235.0,
        max_downwind_km=14.0,
        stability_class="C",
        cnn_fire_area_m2=verified_area_m2,
        frp_mw=telemetry["frp"]
    )
    
    attributions = compute_feature_attributions(telemetry, triage_result)
    
    # Extract zone radii from dispersion features
    zone_radii = {}
    for feat in dispersion.get("features", []):
        zid = feat["properties"]["zone_id"]
        zone_radii[zid] = feat["properties"]["reach_km"]
    
    return {
        "incident_id": str(uuid.uuid4()),
        "timestamp_utc": datetime.datetime.utcnow().isoformat() + "Z",
        "classification_level": "SECRET // NTRO // SIH-26162",
        "facility_profile": facility,
        "triage_summary": {
            "class_tag": triage_result["class_tag"],
            "category": triage_result["category"],
            "confidence_pct": round(triage_result["confidence"] * 100, 1),
            "inference_time_ms": triage_result["inference_time_ms"],
            "tai_zscore": round(triage_result["features"]["tai"], 2),
            "spf": triage_result["features"]["spf"],
            "frp_mw": triage_result["features"]["frp"],
            "severity": triage_result["severity"],
            "action": triage_result["action"]
        },
        "xai_feature_attributions": attributions,
        "cnn_verification": {
            "prediction_class": cnn_result["prediction_class"],
            "is_verified_fire": cnn_result["is_verified_fire"],
            "confidence_pct": round(cnn_result["confidence"] * 100, 1),
            "fire_area_m2": cnn_result["fire_footprint"]["fire_area_m2"],
            "fire_area_hectares": cnn_result["fire_footprint"]["fire_area_hectares"],
            "active_pixel_count": cnn_result["fire_footprint"]["active_pixel_count"],
            "max_swir_reflectance": cnn_result["fire_footprint"]["max_swir_reflectance"],
            "mean_nbr_in_core": cnn_result["fire_footprint"]["mean_nbr_in_core"]
        },
        "atmospheric_dispersion": {
            "emission_rate_g_s": dispersion["properties"]["emission_rate_g_s"],
            "wind_speed_m_s": dispersion["properties"]["wind_speed_m_s"],
            "wind_direction_deg": dispersion["properties"]["wind_direction_deg"],
            "stability_class": dispersion["properties"]["stability_class"],
            "zone_1_radius_km": zone_radii.get(1, "N/A"),
            "zone_2_radius_km": zone_radii.get(2, "N/A"),
            "zone_3_radius_km": zone_radii.get(3, "N/A"),
            "max_evacuation_radius_km": dispersion["properties"]["max_evacuation_radius_km"]
        },
        "ndrf_sop_dispatch": [
            "IMMEDIATE ACTION: Alert local DDMA and NDRF battalion.",
            f"Evacuate Zone 1 (IDLH Lethal Threat, {zone_radii.get(1, 'N/A')} km radius) immediately.",
            f"Mandatory civilian evacuation within Zone 2 ({zone_radii.get(2, 'N/A')} km radius) downwind.",
            "Deploy HAZMAT team with full SCBA to facility perimeter.",
            "Initiate perimeter air quality monitoring (SO₂, H₂S, PM₂.₅, CO).",
            f"CNN-verified combustion core: {verified_area_m2:,.0f} m² — structure fire confirmed.",
            "Coordinate with State Pollution Control Board for environmental sampling."
        ]
    }


def generate_incident_dossier_pdf(facility_key: str, scenario: str = "structural_explosion") -> bytes:
    """
    Generate a defense-formatted incident report PDF.
    """
    data = generate_incident_dossier_json(facility_key, scenario)
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Courier-Bold',
        textColor=colors.red,
        alignment=1
    )
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Heading2'],
        fontName='Courier-Bold',
        textColor=colors.black
    )
    
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontName='Courier',
        textColor=colors.black
    )
    
    elements = []
    
    # Header
    elements.append(Paragraph("CLASSIFIED // NTRO-AURA-FIRE // FLASH INCIDENT REPORT", title_style))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(f"Incident ID: {data['incident_id']}", normal_style))
    elements.append(Paragraph(f"Timestamp (UTC): {data['timestamp_utc']}", normal_style))
    elements.append(Paragraph("Classification: SECRET // NTRO // SIH-26162", normal_style))
    elements.append(Spacer(1, 20))
    
    # Section 1
    elements.append(Paragraph("Section 1 - Facility Profile", header_style))
    fac = data["facility_profile"]
    fac_data = [
        ["Name", fac.get("name", "Unknown")],
        ["Company", fac.get("company", "Unknown")],
        ["Coordinates", f"{fac.get('lat', 0.0)}, {fac.get('lon', 0.0)}"],
        ["State", fac.get("state", "Unknown")],
        ["Sector", fac.get("sector", "Unknown")],
        ["Risk Tier", fac.get("risk_tier", "Unknown")]
    ]
    t1 = Table(fac_data, colWidths=[150, 300])
    t1.setStyle(TableStyle([('FONT', (0,0), (-1,-1), 'Courier'), ('GRID', (0,0), (-1,-1), 1, colors.gray)]))
    elements.append(t1)
    elements.append(Spacer(1, 15))
    
    # Section 2
    elements.append(Paragraph("Section 2 - Tier 1 LightGBM Triage", header_style))
    tri = data["triage_summary"]
    tri_data = [
        ["Class Tag", str(tri.get("class_tag", "N/A"))],
        ["Category", str(tri.get("category", "N/A"))],
        ["Confidence", f"{tri.get('confidence_pct', 0)}%"],
        ["Latency", f"{tri.get('inference_time_ms', 'N/A')} ms"],
        ["TAI Z-score", f"+{tri.get('tai_zscore', 'N/A')}σ"],
        ["SPF", str(tri.get("spf", "N/A"))],
        ["FRP (MW)", str(tri.get("frp_mw", "N/A"))]
    ]
    t2 = Table(tri_data, colWidths=[150, 300])
    t2.setStyle(TableStyle([('FONT', (0,0), (-1,-1), 'Courier'), ('GRID', (0,0), (-1,-1), 1, colors.gray)]))
    elements.append(t2)
    elements.append(Spacer(1, 15))
    
    # Section 3
    elements.append(Paragraph("Section 3 - XAI Feature Attribution (Explainability Audit)", header_style))
    xai = data["xai_feature_attributions"]
    xai_data = [["Feature", "Value", "Baseline", "Contribution", "Direction"]]
    for item in xai:
        xai_data.append([
            str(item.get("feature", "N/A")), 
            str(item.get("value", "N/A")), 
            str(item.get("baseline", "N/A")), 
            f"{item.get('contribution', 0):.3f}", 
            str(item.get("direction", "N/A"))
        ])
    t3 = Table(xai_data)
    t3.setStyle(TableStyle([
        ('FONT', (0,0), (-1,-1), 'Courier'), 
        ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
        ('GRID', (0,0), (-1,-1), 1, colors.gray)
    ]))
    elements.append(t3)
    elements.append(Spacer(1, 15))
    
    # Section 4
    elements.append(Paragraph("Section 4 - Tier 2 CNN Verification", header_style))
    cnn = data["cnn_verification"]
    cnn_data = [
        ["Prediction", str(cnn.get("prediction_class", "N/A"))],
        ["Fire Area (m²)", f"{cnn.get('fire_area_m2', 0):,.0f}"],
        ["Fire Area (ha)", str(cnn.get("fire_area_hectares", "N/A"))],
        ["Active Pixels", str(cnn.get("active_pixel_count", "N/A"))],
        ["Max SWIR Reflectance", str(cnn.get("max_swir_reflectance", "N/A"))],
        ["Mean NBR in Core", str(cnn.get("mean_nbr_in_core", "N/A"))]
    ]
    t4 = Table(cnn_data, colWidths=[150, 300])
    t4.setStyle(TableStyle([('FONT', (0,0), (-1,-1), 'Courier'), ('GRID', (0,0), (-1,-1), 1, colors.gray)]))
    elements.append(t4)
    elements.append(Spacer(1, 15))
    
    # Section 5
    elements.append(Paragraph("Section 5 - Atmospheric Dispersion", header_style))
    disp = data["atmospheric_dispersion"]
    disp_data = [
        ["Emission Rate Q", f"{disp.get('emission_rate_g_s', 'N/A')} g/s"],
        ["Wind Speed", f"{disp.get('wind_speed_m_s', 'N/A')} m/s"],
        ["Wind Direction", f"{disp.get('wind_direction_deg', 'N/A')}°"],
        ["Stability Class", str(disp.get("stability_class", "N/A"))],
        ["Zone 1 Radius (IDLH)", f"{disp.get('zone_1_radius_km', 'N/A')} km"],
        ["Zone 2 Radius (ERPG-2)", f"{disp.get('zone_2_radius_km', 'N/A')} km"],
        ["Zone 3 Radius (ERPG-1)", f"{disp.get('zone_3_radius_km', 'N/A')} km"],
        ["Max Evacuation Radius", f"{disp.get('max_evacuation_radius_km', 'N/A')} km"]
    ]
    t5 = Table(disp_data, colWidths=[150, 300])
    t5.setStyle(TableStyle([('FONT', (0,0), (-1,-1), 'Courier'), ('GRID', (0,0), (-1,-1), 1, colors.gray)]))
    elements.append(t5)
    elements.append(Spacer(1, 15))
    
    # Section 6
    elements.append(Paragraph("Section 6 - NDRF SOP Dispatch Directive", header_style))
    for action in data["ndrf_sop_dispatch"]:
        elements.append(Paragraph(f"- {action}", normal_style))
    elements.append(Spacer(1, 30))
    
    # Footer
    elements.append(Paragraph("Generated by AURA-Fire Engine v2.0.0 // NTRO SIH-26162", 
                              ParagraphStyle('Footer', parent=styles['Normal'], fontName='Courier-Bold', alignment=1)))
    
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
