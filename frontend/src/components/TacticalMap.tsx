import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface TacticalMapProps {
  targetCoords: [number, number]; // [lat, lon]
  targetName: string;
  isExplosion: boolean;
  plumeData?: {
    features: Array<{
      properties: {
        zone_id: number;
        zone_name: string;
        color: string;
        reach_km: number;
        advisory: string;
      };
      geometry: {
        coordinates: number[][][];
      };
    }>;
  } | null;
  onSelectFacility?: (facilityKey: string) => void;
}

const MONITORED_SITES = [
  { key: 'jamnagar', name: 'Jamnagar Refinery Complex', coords: [22.4707, 69.8331] as [number, number], type: 'Oil & Gas' },
  { key: 'bhilai', name: 'Bhilai Steel Plant', coords: [21.1895, 81.3976] as [number, number], type: 'Metallurgy' },
  { key: 'nagothane', name: 'Nagothane Petrochemical Complex', coords: [18.5285, 73.1362] as [number, number], type: 'Chemicals' },
  { key: 'punjab', name: 'Punjab Agricultural Stubble', coords: [30.2458, 75.8421] as [number, number], type: 'Biomass Burning' },
];

export const TacticalMap: React.FC<TacticalMapProps> = ({
  targetCoords,
  targetName,
  isExplosion,
  plumeData,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const plumeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const targetMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Create Map with India view
    const map = L.map(mapContainerRef.current, {
      center: targetCoords,
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark Matter tile layer (completely free, zero tokens, dark intelligence theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Zoom control in top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add layer group for plume polygons
    const plumeGroup = L.layerGroup().addTo(map);
    plumeLayerGroupRef.current = plumeGroup;

    // Add static facility markers across India
    MONITORED_SITES.forEach((site) => {
      const isCurrent = site.name === targetName;
      const marker = L.circleMarker(site.coords, {
        radius: isCurrent ? 8 : 5,
        fillColor: isCurrent ? (isExplosion ? '#ef4444' : '#10b981') : '#38bdf8',
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.8,
      }).addTo(map);

      marker.bindTooltip(`<b>${site.name}</b><br><span style="font-size:11px;color:#94a3b8">${site.type}</span>`, {
        direction: 'top',
        className: 'tactical-tooltip',
      });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map view & markers on target or explosion state change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Smooth fly to target coordinates
    map.flyTo(targetCoords, isExplosion ? 10 : 12, { duration: 1.2 });

    // Update or create active target marker
    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
    }

    const activeMarker = L.circleMarker(targetCoords, {
      radius: isExplosion ? 14 : 9,
      fillColor: isExplosion ? '#ef4444' : '#10b981',
      color: '#ffffff',
      weight: 2,
      opacity: 1.0,
      fillOpacity: 0.9,
    }).addTo(map);

    activeMarker.bindPopup(`
      <div style="font-family: monospace; font-size: 12px; color: #0f172a; padding: 4px;">
        <b style="color: ${isExplosion ? '#dc2626' : '#059669'}">${isExplosion ? '⚠️ CRITICAL EXPLOSION' : '✓ ROUTINE FLARING'}</b><br>
        <b>Target:</b> ${targetName}<br>
        <b>Lat/Lon:</b> ${targetCoords[0].toFixed(4)}, ${targetCoords[1].toFixed(4)}
      </div>
    `);

    targetMarkerRef.current = activeMarker;

    // Draw H3 Res-8 Hexagon approximation around target (~460m radius)
    const hexRadiusMeters = 500;
    const hexCircle = L.circle(targetCoords, {
      radius: hexRadiusMeters,
      color: isExplosion ? '#ef4444' : '#06b6d4',
      fillColor: isExplosion ? '#ef4444' : '#06b6d4',
      fillOpacity: 0.15,
      weight: 2,
      dashArray: '4, 4',
    }).addTo(map);

    // Render Plume Hazard Cones
    const plumeGroup = plumeLayerGroupRef.current;
    if (plumeGroup) {
      plumeGroup.clearLayers();

      if (isExplosion && plumeData && plumeData.features) {
        // Draw each hazard zone polygon (reversed so outer zone 3 is on bottom, zone 1 on top)
        plumeData.features.forEach((feat) => {
          const rawCoords = feat.geometry.coordinates[0];
          // Leaflet expects [lat, lon], GeoJSON is [lon, lat]
          const leafletCoords = rawCoords.map((c) => [c[1], c[0]] as [number, number]);

          const poly = L.polygon(leafletCoords, {
            color: feat.properties.color,
            fillColor: feat.properties.color,
            fillOpacity: feat.properties.zone_id === 1 ? 0.45 : feat.properties.zone_id === 2 ? 0.3 : 0.15,
            weight: 1.5,
          });

          poly.bindTooltip(`<b>${feat.properties.zone_name}</b><br>Radius: ${feat.properties.reach_km} km<br>${feat.properties.advisory}`, {
            sticky: true,
          });

          plumeGroup.addLayer(poly);
        });
      }
    }

    return () => {
      hexCircle.remove();
    };
  }, [targetCoords, targetName, isExplosion, plumeData]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-950" />

      {/* Map Overlay Badges */}
      <div className="absolute top-3 left-3 z-[400] flex flex-col space-y-1.5 pointer-events-none">
        <div className="bg-slate-900/90 border border-slate-700/80 backdrop-blur px-3 py-1.5 rounded-md shadow-lg flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-[11px] font-mono font-bold text-slate-200">TACTICAL GEOINT MAP ACTIVE</span>
        </div>
        <div className="bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400 px-2.5 py-1 rounded">
          CartoDB Dark Matter Tiles | OpenStreetMap
        </div>
      </div>

      {/* Wind Direction Compass Widget */}
      {isExplosion && (
        <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 border border-red-900/80 backdrop-blur p-2.5 rounded-lg shadow-xl font-mono text-xs text-slate-300 pointer-events-none space-y-1">
          <div className="flex items-center space-x-2 text-red-400 font-bold">
            <span>💨 10m Wind Vector:</span>
            <span>5.2 m/s @ 235° (SW)</span>
          </div>
          <p className="text-[11px] text-slate-400">Toxic plume propagating NE towards Jamnagar civil sectors</p>
        </div>
      )}
    </div>
  );
};
