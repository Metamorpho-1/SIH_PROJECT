import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Eye, Satellite, Radio, Compass } from 'lucide-react';
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
  } | null;
  onSelectFacility?: (facility: CorporateFacility) => void;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  targetCoords,
  targetName,
  isExplosion,
  plumeData,
  onSelectFacility,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const plumeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const targetMarkerRef = useRef<L.CircleMarker | null>(null);
  const [basemapMode, setBasemapMode] = useState<'satellite' | 'dark'>('satellite');
  const [isScanning, setIsScanning] = useState(true);

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

  // Fly to target on coordinate change & update polygons
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo(targetCoords, isExplosion ? 11 : 12, { duration: 1.2 });

    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
    }

    const activeMarker = L.circleMarker(targetCoords, {
      radius: isExplosion ? 14 : 9,
      fillColor: isExplosion ? '#ef4444' : '#10b981',
      color: '#ffffff',
      weight: 2.5,
      opacity: 1.0,
      fillOpacity: 0.9,
    }).addTo(map);

    targetMarkerRef.current = activeMarker;

    // Uber H3 Res-8 Hexagon Boundary (~500m radius)
    const hexRadiusMeters = 520;
    const hexCircle = L.circle(targetCoords, {
      radius: hexRadiusMeters,
      color: isExplosion ? '#ef4444' : '#06b6d4',
      fillColor: isExplosion ? '#ef4444' : '#06b6d4',
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
            fillOpacity: feat.properties.zone_id === 1 ? 0.50 : feat.properties.zone_id === 2 ? 0.32 : 0.18,
            weight: 2,
          });

          poly.bindTooltip(
            `<div style="font-family:monospace;font-size:11px;padding:2px;">
              <b style="color:${feat.properties.color}">${feat.properties.zone_name}</b><br>
              <b>Radius:</b> ${feat.properties.reach_km} km<br>
              <span style="color:#64748b">${feat.properties.advisory}</span>
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
  }, [targetCoords, targetName, isExplosion, plumeData]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-950" />

      {/* Animated Simulated NASA FIRMS Satellite Sweep Beam */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[300]">
          <div className="w-full h-24 bg-gradient-to-b from-transparent via-cyan-500/15 to-transparent border-b border-cyan-400/40 animate-radar-sweep shadow-[0_0_25px_rgba(6,182,212,0.2)]"></div>
        </div>
      )}

      {/* Top Left: Operational HUD Badges */}
      <div className="absolute top-3 left-3 z-[400] flex flex-col space-y-2 pointer-events-none">
        <div className="bg-slate-900/90 border border-slate-700/80 backdrop-blur px-3 py-1.5 rounded-lg shadow-2xl flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-xs font-mono font-bold text-slate-100 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>NASA FIRMS VIIRS 375m ORBITAL RECON</span>
          </span>
        </div>

        <div className="bg-slate-950/85 border border-slate-800 backdrop-blur text-[11px] font-mono text-slate-300 px-3 py-1 rounded-md shadow-md">
          {basemapMode === 'satellite' ? '🛰️ ESRI World High-Res Satellite | Zero Watermarks' : '⚡ Cyber Tactical Dark Mode'}
        </div>
      </div>

      {/* Top Right: Basemap Selector & Satellite Beam Toggle */}
      <div className="absolute top-3 right-14 z-[400] flex items-center space-x-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur p-1 rounded-lg shadow-xl">
        <button
          onClick={() => toggleBasemap('satellite')}
          className={`px-2.5 py-1 rounded text-xs font-mono flex items-center space-x-1 transition ${
            basemapMode === 'satellite' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700' : 'text-slate-400 hover:text-white'
          }`}
          title="Switch to Real Optical Satellite Imagery"
        >
          <Satellite className="w-3.5 h-3.5" />
          <span>Satellite Recon</span>
        </button>
        <button
          onClick={() => toggleBasemap('dark')}
          className={`px-2.5 py-1 rounded text-xs font-mono flex items-center space-x-1 transition ${
            basemapMode === 'dark' ? 'bg-blue-950 text-blue-300 font-bold border border-blue-700' : 'text-slate-400 hover:text-white'
          }`}
          title="Switch to Inverted Tactical Dark Tiles"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Cyber Dark</span>
        </button>
        <button
          onClick={() => setIsScanning(!isScanning)}
          className={`px-2 py-1 rounded text-xs font-mono transition ${
            isScanning ? 'text-cyan-400 bg-slate-800' : 'text-slate-500'
          }`}
          title="Toggle Satellite Radar Sweep Scanline"
        >
          Scan Beam
        </button>
      </div>

      {/* Bottom Left: Wind Vector Compass HUD */}
      {isExplosion && (
        <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/95 border border-red-800/80 backdrop-blur p-3 rounded-xl shadow-2xl font-mono text-xs text-slate-200 pointer-events-none space-y-1.5 max-w-xs">
          <div className="flex items-center justify-between text-red-400 font-bold">
            <span className="flex items-center space-x-1.5">
              <Compass className="w-4 h-4 text-red-400 animate-spin" />
              <span>10m Wind Vector:</span>
            </span>
            <span className="text-white">5.2 m/s @ 235° (SW)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Active toxic chemical plume dispersion propagating Northeast directly toward local civil defense sectors.
          </p>
          <div className="flex items-center space-x-2 pt-1 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">Zone 1: 4.8 km</span>
            <span className="px-1.5 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-800">Zone 2: 9.0 km</span>
            <span className="px-1.5 py-0.5 rounded bg-yellow-950 text-yellow-400 border border-yellow-800">Zone 3: 15 km</span>
          </div>
        </div>
      )}
    </div>
  );
};
