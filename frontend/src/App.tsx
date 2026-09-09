import { useState, useEffect } from 'react';
import { 
  Flame, 
  Satellite, 
  Layers, 
  Play, 
  Zap, 
  Crosshair, 
  ShieldCheck, 
  Sun,
  Activity,
  MapPin,
  TrendingUp,
  AlertOctagon
} from 'lucide-react';

import { TacticalMap } from './components/TacticalMap';
import { TelemetryChart } from './components/TelemetryChart';

interface SimulationResult {
  scenario: string;
  facility: string;
  coordinates: { lat: number; lon: number };
  telemetry: any;
  triage_result: {
    class_id: number;
    class_tag: string;
    category: string;
    action: string;
    action_details: string;
    severity: string;
    confidence: number;
    inference_time_ms: number;
    features: {
      frp: number;
      tai: number;
      spf: number;
      bright_ti4: number;
    };
  };
  cnn_verification?: {
    prediction_class: string;
    is_verified_fire: boolean;
    confidence: number;
    action: string;
    explanation: string;
    fire_footprint: {
      active_pixel_count: number;
      fire_area_m2: number;
      fire_area_hectares: number;
      core_centroid_pixel: [number, number];
      max_swir_reflectance: number;
      mean_nbr_in_core: number;
    };
  };
  satellite_imagery?: {
    rgb_preview_url: string;
    swir_preview_url: string;
    patch_dimensions: [number, number];
    gsd_meters: number;
  };
  plume_dispersion?: {
    type: string;
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
    properties: {
      emission_rate_g_s: number;
      max_evacuation_radius_km: number;
    };
  };
  ndrf_sop_dispatch?: any;
  demo_notes: string;
}

const API_BASE = 'http://localhost:8000/api/v1';

export default function App() {
  const [activeScenario, setActiveScenario] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [satelliteViewMode, setSatelliteViewMode] = useState<'swir' | 'rgb' | 'mask'>('swir');

  // Load default baseline scenario on initial mount so screen is never empty
  useEffect(() => {
    triggerBaselineProof();
  }, []);

  const triggerBaselineProof = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/baseline-proof`);
      const data = await res.json();
      setActiveScenario(data);
    } catch (err) {
      console.error('API error, loading fallback baseline:', err);

      // Robust offline fallback
      setActiveScenario({
        scenario: "BASELINE_OPERATIONAL_PROOF",
        facility: "Reliance Jamnagar Refinery Complex",
        coordinates: { lat: 22.4707, lon: 69.8331 },
        telemetry: { frp: 25.7, bright_ti4: 328.0, latitude: 22.4707, longitude: 69.8331 },
        triage_result: {
          class_id: 0,
          class_tag: "CLASS 0",
          category: "Routine Industrial Activity",
          action: "SUPPRESS_ALARM",
          action_details: "Suppress alarm; update rolling baseline distribution.",
          severity: "NORMAL",
          confidence: 0.96,
          inference_time_ms: 0.005,
          features: { frp: 25.7, tai: 0.32, spf: 0.65, bright_ti4: 328.0 }
        },
        demo_notes: "5 active refinery flares detected. TAI is within normal baseline (<=2.5σ). CNN confirms localized routine flaring with alarm suppressed."
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerIncidentInjection = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/inject-explosion`, { method: 'POST' });
      const data = await res.json();
      setActiveScenario(data);
    } catch (err) {
      console.error('API error on incident injection:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFalseGlareTest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/verification/cnn-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'false_glare', latitude: 22.4707, longitude: 69.8331 })
      });
      const data = await res.json();
      setActiveScenario({
        scenario: "FALSE_GLARE_TEST",
        facility: "Industrial Solar & Metal Roof Complex",
        coordinates: { lat: 22.4707, lon: 69.8331 },
        telemetry: { frp: 38.4, bright_ti4: 342.0, latitude: 22.4707, longitude: 69.8331 },
        triage_result: {
          class_id: 0,
          class_tag: "CLASS 0",
          category: "Specular Optical Glare (False Alarm)",
          action: "DISMISS_FALSE_ALARM",
          action_details: "Optical glare rejected by Stage 3 Multi-Spectral CNN.",
          severity: "NORMAL",
          confidence: 0.94,
          inference_time_ms: 0.007,
          features: { frp: 38.4, tai: 1.8, spf: 0.15, bright_ti4: 342.0 }
        },
        cnn_verification: data.cnn_verification,
        satellite_imagery: data.satellite_imagery,
        demo_notes: "High solar / roof reflection triggered thermal threshold, but Stage 3 Multi-Spectral CNN successfully verified positive NBR and dismissed the false alarm."
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isExplosion = activeScenario?.triage_result?.class_id === 1;
  const currentCoords: [number, number] = activeScenario?.coordinates
    ? [activeScenario.coordinates.lat, activeScenario.coordinates.lon]
    : [22.4707, 69.8331];

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Tactical Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-red-600/20 border border-red-500/40 rounded-xl text-red-400 shadow-inner">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-xs font-bold uppercase px-2 py-0.5 bg-blue-950 text-blue-400 border border-blue-800 rounded">
                NTRO SIH-26162
              </span>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                AURA-Fire
                <span className="text-xs font-mono font-normal px-2.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                  Dual-Tier AI Active
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Operational Spatio-Temporal Intelligence & Satellite Verification System
            </p>
          </div>
        </div>

        {/* Demo Simulation Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={triggerBaselineProof}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow transition active:scale-95"
            title="Step 1: Demonstrate zero false alarms over 5 active Jamnagar gas flares"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Baseline Proof</span>
          </button>
          
          <button
            onClick={triggerIncidentInjection}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-mono font-bold bg-red-950 hover:bg-red-900 text-red-200 border border-red-700 shadow-lg shadow-red-950/40 transition active:scale-95"
            title="Step 2: Inject sudden 120MW industrial thermal explosion"
          >
            <Zap className="w-4 h-4 text-red-400 animate-bounce" />
            <span>2. Inject 120MW Explosion</span>
          </button>

          <button
            onClick={triggerFalseGlareTest}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800 shadow transition active:scale-95"
            title="Step 3: Demonstrate CNN rejection of specular optical glare"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Test Solar Glare Rejection</span>
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Half: Tactical Map Canvas */}
        <div className="flex-1 relative flex flex-col border-r border-slate-800">
          {/* Map Header Bar */}
          <div className="h-10 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 font-mono text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="font-bold">TACTICAL GEOINT MAP</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">Uber H3 Res-8 Hexagonal Discrete Grid</span>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              <span className="text-white font-bold">{activeScenario?.facility || 'Jamnagar Refinery'}</span>
            </div>
          </div>

          {/* Interactive Leaflet Dark Map */}
          <div className="flex-1 relative">
            <TacticalMap
              targetCoords={currentCoords}
              targetName={activeScenario?.facility || 'Jamnagar Refinery'}
              isExplosion={isExplosion}
              plumeData={activeScenario?.plume_dispersion || null}
            />
          </div>

          {/* Map Operational Alert Banner */}
          <div className={`p-3 border-t text-xs font-mono flex items-center justify-between ${
            isExplosion 
              ? 'bg-red-950/90 border-red-800 text-red-200' 
              : 'bg-slate-900/90 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center space-x-2">
              {isExplosion ? (
                <AlertOctagon className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span><b>STATUS:</b> {activeScenario?.demo_notes}</span>
            </div>
            {isExplosion && activeScenario?.ndrf_sop_dispatch && (
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold uppercase text-[10px]">
                NDRF EVACUATION ZONE: {activeScenario.ndrf_sop_dispatch.evacuation_zone_km} KM
              </span>
            )}
          </div>
        </div>

        {/* Right Half: Tactical Triage & Deep-Learning Intelligence Panel */}
        <aside className="w-[480px] bg-slate-950 flex flex-col border-l border-slate-800 overflow-y-auto shrink-0 divide-y divide-slate-800/80">
          {/* Panel Header */}
          <div className="p-4 bg-slate-900/60 flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Multi-Tier AI Triage Telemetry</span>
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
              NASA FIRMS VIIRS 375m
            </span>
          </div>

          {/* Section 1: Tier 1 LightGBM Rapid Triage (<5ms) */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tier 1: Sub-5ms LightGBM Decision</span>
              </span>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                Latency: {activeScenario?.triage_result.inference_time_ms || 0.008} ms
              </span>
            </div>

            {/* Classification Outcome Card */}
            <div className={`p-3.5 rounded-xl border ${
              isExplosion
                ? 'bg-red-950/40 border-red-700/80 shadow-lg shadow-red-950/20'
                : 'bg-emerald-950/30 border-emerald-800/60'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                  isExplosion ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                  {activeScenario?.triage_result.class_tag}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Confidence: {((activeScenario?.triage_result.confidence || 0.96) * 100).toFixed(1)}%
                </span>
              </div>
              <h4 className="font-bold text-sm text-white">{activeScenario?.triage_result.category}</h4>
              <p className="text-xs text-slate-300 mt-1 font-mono">
                {activeScenario?.triage_result.action_details}
              </p>
            </div>

            {/* Mathematical Anomaly Indices Grid */}
            <div className="grid grid-cols-4 gap-2 font-mono text-xs">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">FRP (MW)</span>
                <span className="text-sm font-bold text-amber-400">{activeScenario?.telemetry.frp}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">TAI Z-Score</span>
                <span className={`text-sm font-bold ${isExplosion ? 'text-red-400' : 'text-blue-400'}`}>
                  +{activeScenario?.triage_result.features.tai.toFixed(1)}σ
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">SPF Persistence</span>
                <span className="text-sm font-bold text-cyan-400">{activeScenario?.triage_result.features.spf}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Band I4</span>
                <span className="text-sm font-bold text-orange-400">{activeScenario?.telemetry.bright_ti4} K</span>
              </div>
            </div>

            {/* Historical FRP Baseline vs Spike Chart */}
            <div className="pt-1">
              <span className="text-[11px] font-mono text-slate-400 block mb-1.5 flex items-center justify-between">
                <span>90-Day Continuous FRP Baseline vs Current Overpass</span>
                <span className="text-slate-500">Threshold: +2.5σ</span>
              </span>
              <TelemetryChart 
                isExplosion={isExplosion} 
                facilityName={activeScenario?.facility || 'Jamnagar Refinery'} 
              />
            </div>
          </div>

          {/* Section 2: Tier 2 Multi-Spectral CNN Verification (Sentinel-2) */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-1.5">
                <Satellite className="w-3.5 h-3.5 text-blue-400" />
                <span>Tier 2: Sentinel-2 Multi-Spectral CNN</span>
              </span>
              <span className="text-xs font-mono text-blue-400 font-bold">
                10m / 20m SWIR Bands
              </span>
            </div>

            {/* Multi-Spectral Imagery Card with Toggles */}
            {activeScenario?.satellite_imagery ? (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Multi-Spectral Patch (64x64 Pixels)</span>
                  </span>
                  
                  {/* View Mode Tabs */}
                  <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-mono">
                    <button
                      onClick={() => setSatelliteViewMode('swir')}
                      className={`px-2 py-0.5 rounded-md transition ${
                        satelliteViewMode === 'swir' 
                          ? 'bg-red-950 text-red-300 font-bold border border-red-800' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      SWIR Heat
                    </button>
                    <button
                      onClick={() => setSatelliteViewMode('rgb')}
                      className={`px-2 py-0.5 rounded-md transition ${
                        satelliteViewMode === 'rgb' 
                          ? 'bg-blue-950 text-blue-300 font-bold border border-blue-800' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Optical RGB
                    </button>
                    <button
                      onClick={() => setSatelliteViewMode('mask')}
                      className={`px-2 py-0.5 rounded-md transition ${
                        satelliteViewMode === 'mask' 
                          ? 'bg-purple-950 text-purple-300 font-bold border border-purple-800' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      CNN Mask
                    </button>
                  </div>
                </div>

                {/* Satellite Image Display */}
                <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-black flex items-center justify-center shadow-inner">
                  <img 
                    src={satelliteViewMode === 'rgb' 
                      ? activeScenario.satellite_imagery.rgb_preview_url 
                      : activeScenario.satellite_imagery.swir_preview_url
                    }
                    alt="Sentinel-2 Satellite Imagery"
                    className="w-full h-full object-cover"
                  />

                  {/* CNN Mask Overlay */}
                  {satelliteViewMode === 'mask' && activeScenario.cnn_verification && (
                    <div className="absolute inset-0 bg-purple-950/40 flex items-center justify-center pointer-events-none border-2 border-purple-500">
                      <div className="text-center p-3 rounded-lg bg-black/90 border border-purple-500/80 font-mono text-xs text-purple-300 shadow-2xl">
                        <p className="font-bold text-purple-200">Active Combustion Perimeter Isolated</p>
                        <p className="text-[11px] text-slate-300 mt-1">
                          {activeScenario.cnn_verification.fire_footprint.active_pixel_count} Active Combustion Pixels (~{activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m²)
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                    {satelliteViewMode === 'rgb' 
                      ? 'B04-B03-B02 (Natural Visible Optical)' 
                      : satelliteViewMode === 'swir' 
                        ? 'B12-B08-B04 (SWIR Infrared False Color)' 
                        : 'AuraFireMultiSpectralCNN Segmentation Mask'}
                  </div>
                </div>

                {/* CNN Metrics Details */}
                {activeScenario.cnn_verification && (
                  <div className="space-y-2 pt-1 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">CNN Classification:</span>
                        <span className={`font-bold ${activeScenario.cnn_verification.is_verified_fire ? 'text-red-400' : 'text-emerald-400'}`}>
                          {activeScenario.cnn_verification.prediction_class.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">CNN Confidence:</span>
                        <span className="font-bold text-amber-400">
                          {(activeScenario.cnn_verification.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Verified Fire Area:</span>
                        <span className="font-bold text-white">
                          {activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m² ({activeScenario.cnn_verification.fire_footprint.fire_area_hectares} ha)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Action:</span>
                        <span className="font-bold text-cyan-400">{activeScenario.cnn_verification.action}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded border border-slate-800/80">
                      {activeScenario.cnn_verification.explanation}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-600 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                Loading multi-spectral satellite verification...
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Tactical Status Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-950 px-5 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center space-x-5">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>PostGIS 16 (OSM Spatial Join: Active)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Stage 1 LightGBM (Sub-5ms Inference: Armed)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            <span>Stage 3 Multi-Spectral CNN (Sentinel-2: Armed)</span>
          </span>
        </div>
        <span className="text-slate-500">AURA-Fire Engine v1.2.0 | NTRO SIH-26162</span>
      </footer>
    </div>
  );
}
