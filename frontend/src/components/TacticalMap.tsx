import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Eye, Satellite, Compass } from 'lucide-react';
import { CORPORATE_FACILITIES, CorporateFacility } from './FacilitySelector';

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
    properties?: {
      emission_rate_g_s: number;
      max_evacuation_radius_km: number;
      wind_speed_m_s: number;
      wind_direction_deg: number;
      stability_class: string;
    };
  } | null;
  liveWeather?: {
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    computed_stability_class?: string;
    source?: string;
  } | null;
  onSelectFacility?: (facility: CorporateFacility) => void;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  targetCoords,
  targetName,
  isExplosion,
  plumeData,
  liveWeather,
  onSelectFacility,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const plumeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const targetMarkerRef = useRef<L.CircleMarker | null>(null);
  const [basemapMode, setBasemapMode] = useState<'satellite' | 'dark'>('satellite');


  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: targetCoords,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Default: ESRI High-Resolution World Imagery (100% Free, Zero API Keys, Zero Watermarks)
    const initialTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = initialTile;

    L.control.zoom({ position: 'topright' }).addTo(map);

    const plumeGroup = L.layerGroup().addTo(map);
    plumeLayerGroupRef.current = plumeGroup;

    // Render all national corporate facilities
    CORPORATE_FACILITIES.forEach((fac) => {
      const isCurrent = fac.name === targetName;
      const marker = L.circleMarker(fac.coords, {
        radius: isCurrent ? 8 : 5,
        fillColor: fac.isDisaster ? '#ef4444' : isCurrent ? '#10b981' : '#38bdf8',
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.85,
      }).addTo(map);

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;color:#0f172a">
          <b>${fac.name}</b><br>
          <span style="color:#64748b">${fac.company}</span>
        </div>`,
        { direction: 'top', sticky: true }
      );

      marker.on('click', () => {
        if (onSelectFacility) {
          onSelectFacility(fac);
        }
      });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Basemap Switch (Satellite Recon vs Cyber Dark)
  const toggleBasemap = (mode: 'satellite' | 'dark') => {
    setBasemapMode(mode);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    if (mode === 'satellite') {
      // High-Res Satellite Imagery (Real oil tanks and ground perimeters visible)
      if (mapContainerRef.current) {
        mapContainerRef.current.classList.remove('leaflet-tactical-dark');
      }
      const satTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
      }).addTo(map);
      tileLayerRef.current = satTile;
    } else {
      // Inverted Dark Mode OpenStreetMap (Zero Watermarks, High-contrast Tactical)
      if (mapContainerRef.current) {
        mapContainerRef.current.classList.add('leaflet-tactical-dark');
      }
      const darkTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
      }).addTo(map);
      tileLayerRef.current = darkTile;
    }
  };

  // 1. Camera Control: Fly to target only when coordinates or explosion status changes
  const targetLat = targetCoords[0];
  const targetLon = targetCoords[1];

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo([targetLat, targetLon], isExplosion ? 11 : 12, { duration: 1.2 });
  }, [targetLat, targetLon, isExplosion]);

  // 2. Data Layers: Update markers, hexes, and plumes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
    }

    const customIcon = L.divIcon({
      className: isExplosion ? 'leaflet-pulse-icon' : 'leaflet-pulse-icon-safe',
      iconSize: isExplosion ? [30, 30] : [20, 20],
      html: '',
    });

    const activeMarker = L.marker([targetLat, targetLon], {
      icon: customIcon,
    }).addTo(map);

    targetMarkerRef.current = activeMarker as any;

    // Uber H3 Res-8 Hexagon Boundary (~500m radius)
    const hexRadiusMeters = 520;
    const hexCircle = L.circle(targetCoords, {
      radius: hexRadiusMeters,
      color: isExplosion ? '#ef4444' : '#0ea5e9',
      fillColor: isExplosion ? '#ef4444' : '#0ea5e9',
      fillOpacity: isExplosion ? 0.25 : 0.15,
      weight: 2,
      dashArray: '5, 5',
    }).addTo(map);

    // Render Plume Hazard Polygons
    const plumeGroup = plumeLayerGroupRef.current;
    if (plumeGroup) {
      plumeGroup.clearLayers();

      if (isExplosion && plumeData && plumeData.features) {
        plumeData.features.forEach((feat) => {
          const rawCoords = feat.geometry.coordinates[0];
          const leafletCoords = rawCoords.map((c) => [c[1], c[0]] as [number, number]);

          const poly = L.polygon(leafletCoords, {
            color: feat.properties.color,
            fillColor: feat.properties.color,
            fillOpacity: feat.properties.zone_id === 1 ? 0.40 : feat.properties.zone_id === 2 ? 0.25 : 0.12,
            weight: 1.5,
          });

          poly.bindTooltip(
            `<div style="font-family:inherit;font-size:12px;padding:4px;">
              <b style="color:${feat.properties.color}">${feat.properties.zone_name}</b><br>
              <span style="color:#71717a">Radius: ${feat.properties.reach_km} km</span><br>
              <span style="color:#a1a1aa">${feat.properties.advisory}</span>
            </div>`,
            { sticky: true }
          );

          plumeGroup.addLayer(poly);
        });
      }
    }

    return () => {
      hexCircle.remove();
    };
  }, [targetCoords, isExplosion, plumeData]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950">
      <div ref={mapContainerRef} className="w-full h-full z-0 map-cinematic-mask" />

      {/* Top Left: Operational Status */}
      <div className="absolute top-4 left-4 z-[400] flex flex-col space-y-2 pointer-events-none">
        <div className="bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm flex items-center space-x-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-medium text-zinc-200">
            System Active
          </span>
        </div>
      </div>

      {/* Top Right: Basemap Selector */}
      <div className="absolute top-4 right-4 z-[400] flex items-center space-x-2 bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md p-1.5 rounded-2xl shadow-sm">
        <button
          onClick={() => toggleBasemap('satellite')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition ${
            basemapMode === 'satellite' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Satellite className="w-4 h-4" />
          <span>Satellite</span>
        </button>
        <button
          onClick={() => toggleBasemap('dark')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition ${
            basemapMode === 'dark' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Minimal Dark</span>
        </button>
      </div>

      {/* Bottom Left: Wind Vector Compass HUD */}
      {isExplosion && plumeData && (
        <div className="absolute bottom-6 left-6 z-[400] bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-xl p-4 rounded-3xl shadow-xl text-sm text-zinc-300 pointer-events-none space-y-2 max-w-sm">
          <div className="flex items-center justify-between text-zinc-100">
            <span className="flex items-center space-x-2 font-medium">
              <Compass className="w-4 h-4 text-zinc-400" />
              <span>Wind Conditions</span>
            </span>
            <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded-lg text-xs">
              {liveWeather?.wind_speed_10m ?? plumeData.properties?.wind_speed_m_s ?? 5.2} m/s
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Plume dispersion based on {liveWeather?.wind_direction_10m ?? plumeData.properties?.wind_direction_deg ?? 235}° wind direction and Stability Class {liveWeather?.computed_stability_class ?? plumeData.properties?.stability_class ?? 'C'}.
          </p>
          <div className="flex flex-col gap-1.5 pt-2 text-[11px] font-medium">
            {plumeData.features?.map((feat) => (
              <div key={feat.properties.zone_id} className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: feat.properties.color }}></div>
                <span className="text-zinc-300">{feat.properties.zone_name}: {feat.properties.reach_km} km radius</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
