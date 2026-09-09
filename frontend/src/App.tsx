import { useState } from 'react';
import { 
  Flame, 
  Satellite, 
  Wind, 
  AlertTriangle, 
  Layers, 
  Play, 
  Zap, 
  Crosshair, 
  ShieldCheck, 
  Sun 
} from 'lucide-react';


interface SimulationResult {
  scenario: string;
  facility: string;
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
    segmentation_mask_active_pixels: Array<[number, number, number]>;
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
    }>;
    properties: {
      emission_rate_g_s: number;
      max_evacuation_radius_km: number;
    };
  };
  ndrf_sop_dispatch?: any;
  demo_notes: string;
}

export default function App() {
  const [activeScenario, setActiveScenario] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [satelliteViewMode, setSatelliteViewMode] = useState<'swir' | 'rgb' | 'mask'>('swir');

  const triggerBaselineProof = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/simulation/baseline-proof');
      const data = await res.json();
      setActiveScenario(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const triggerIncidentInjection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/simulation/inject-explosion', { method: 'POST' });
      const data = await res.json();
      setActiveScenario(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFalseGlareTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/verification/cnn-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'false_glare', latitude: 22.4707, longitude: 69.8331 })
      });
      const data = await res.json();
      setActiveScenario({
        scenario: "FALSE_GLARE_TEST",
        facility: "Industrial Solar & Metal Roof Complex",
        telemetry: { frp: 38.4, bright_ti4: 342.0 },
        triage_result: {
          class_id: 0,
          class_tag: "CLASS 0",
          category: "Specular Optical Glare (False Alarm)",
          action: "DISMISS_FALSE_ALARM",
          action_details: "Optical glare rejected by Stage 3 Multi-Spectral CNN.",
          severity: "NORMAL",
          confidence: 0.94,
          inference_time_ms: 2.1,
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

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans">
      {/* Tactical Top Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-600/20 border border-red-500/40 rounded-lg text-red-400">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-semibold tracking-wider uppercase px-2 py-0.5 bg-blue-950 text-blue-400 border border-blue-800 rounded">
                NTRO SIH-26162
              </span>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                AURA-Fire
                <span className="text-xs font-mono font-normal px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">
                  Dual-Tier AI (LightGBM + CNN)
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono">Operational Spatio-Temporal Intelligence & Satellite Verification System</p>
          </div>
        </div>

        {/* Demo Simulation Action Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={triggerBaselineProof}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Baseline Proof</span>
          </button>
          <button
            onClick={triggerIncidentInjection}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-mono bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 transition"
          >
            <Zap className="w-3.5 h-3.5 text-red-400" />
            <span>2. Inject 120MW Explosion</span>
          </button>
          <button
            onClick={triggerFalseGlareTest}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-mono bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800/80 transition"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Test Solar/Glare Rejection</span>
          </button>
        </div>
      </header>

      {/* Main Multi-Panel Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Central Tactical Hex-Grid Map Canvas */}
        <div className="flex-1 relative bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
          
          {/* Tactical Canvas Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between z-10 bg-slate-950/60 backdrop-blur">
            <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>3D Tactical Map (Uber H3 Res-8 Hexagons + PostGIS Industrial Vectors)</span>
            </div>
            {activeScenario && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                Target: {activeScenario.facility}
              </span>
            )}
          </div>

          {/* Central Map Body / Visual Representation */}
          <div className="flex-1 relative flex items-center justify-center p-6">
            {activeScenario ? (
              <div className="z-10 w-full max-w-2xl bg-slate-950/90 border border-slate-800 rounded-xl p-5 shadow-2xl backdrop-blur space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2.5">
                    {activeScenario.triage_result.class_id === 1 ? (
                      <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
                        <AlertTriangle className="w-5 h-5 animate-bounce" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-white text-base">{activeScenario.facility}</h3>
                      <p className="text-xs font-mono text-slate-400">
                        Coordinates: {activeScenario.telemetry.latitude || 22.4707}°N, {activeScenario.telemetry.longitude || 69.8331}°E
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                    activeScenario.triage_result.class_id === 1
                      ? 'bg-red-950 text-red-400 border border-red-800'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}>
                    {activeScenario.triage_result.class_tag}
                  </span>
                </div>

                {/* Tactical Status Cards */}
                <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-500 block mb-1">Tier 1 LightGBM</span>
                    <span className="text-emerald-400 font-bold">
                      {activeScenario.triage_result.inference_time_ms} ms Latency
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-500 block mb-1">TAI Z-Score</span>
                    <span className={`font-bold ${activeScenario.triage_result.features.tai > 3.0 ? 'text-red-400' : 'text-blue-400'}`}>
                      +{activeScenario.triage_result.features.tai.toFixed(1)}σ
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-500 block mb-1">Tier 2 Multi-Spectral CNN</span>
                    <span className="text-amber-400 font-bold">
                      {activeScenario.cnn_verification?.confidence 
                        ? `${(activeScenario.cnn_verification.confidence * 100).toFixed(1)}% Conf.` 
                        : 'Standby'}
                    </span>
                  </div>
                </div>

                {/* 3-Tier Plume Hazard Zones (if active) */}
                {activeScenario.plume_dispersion && (
                  <div className="p-3.5 rounded-lg bg-red-950/20 border border-red-900/40 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-red-400 font-bold flex items-center space-x-1.5">
                        <Wind className="w-4 h-4" />
                        <span>Dynamic Gaussian Plume Hazard Zones (Coupled with CNN Fire Area)</span>
                      </span>
                      <span className="text-slate-400">Q = {activeScenario.plume_dispersion.properties.emission_rate_g_s} g/s</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
                      {activeScenario.plume_dispersion.features.map((feat, idx) => (
                        <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: feat.properties.color }}></span>
                            <span className="font-bold text-slate-200">{feat.properties.zone_name.split('-')[0]}</span>
                          </div>
                          <span className="text-slate-400 block text-[11px]">Radius: {feat.properties.reach_km} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs font-mono text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800/60">
                  <span className="text-slate-200 font-bold">Operational Note: </span>
                  {activeScenario.demo_notes}
                </p>
              </div>
            ) : (
              <div className="text-center z-10 p-8 max-w-md">
                <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-pulse" />
                <h3 className="text-base font-semibold text-slate-300">Tactical Command Map View</h3>
                <p className="text-xs text-slate-500 mt-2 font-mono">
                  Select a simulation scenario above to inspect the multi-tier triage and deep-learning CNN satellite verification.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Stage 3 Multi-Spectral CNN Inspection & Telemetry */}
        <aside className="w-[430px] bg-slate-950 flex flex-col border-l border-slate-800 overflow-y-auto">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Satellite className="w-4 h-4 text-blue-400" />
              <span>Stage 3 CNN Satellite Verification</span>
            </span>
            <span className="text-xs font-mono text-emerald-400">Sentinel-2 L2A</span>
          </div>

          <div className="p-4 space-y-4">
            {activeScenario?.satellite_imagery ? (
              <div className="space-y-4">
                {/* Multi-Spectral Imagery Card */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-200 flex items-center space-x-1.5">
                      <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Multi-Spectral Patch (64x64 at 20m GSD)</span>
                    </span>
                    <div className="flex rounded-md bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-mono">
                      <button
                        onClick={() => setSatelliteViewMode('swir')}
                        className={`px-2 py-0.5 rounded ${satelliteViewMode === 'swir' ? 'bg-red-950 text-red-300 font-bold border border-red-800' : 'text-slate-400'}`}
                      >
                        SWIR Heat
                      </button>
                      <button
                        onClick={() => setSatelliteViewMode('rgb')}
                        className={`px-2 py-0.5 rounded ${satelliteViewMode === 'rgb' ? 'bg-blue-950 text-blue-300 font-bold border border-blue-800' : 'text-slate-400'}`}
                      >
                        Optical RGB
                      </button>
                      <button
                        onClick={() => setSatelliteViewMode('mask')}
                        className={`px-2 py-0.5 rounded ${satelliteViewMode === 'mask' ? 'bg-purple-950 text-purple-300 font-bold border border-purple-800' : 'text-slate-400'}`}
                      >
                        CNN Mask
                      </button>
                    </div>
                  </div>

                  {/* High-Resolution Satellite Preview */}
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-800 bg-black flex items-center justify-center">
                    <img 
                      src={satelliteViewMode === 'rgb' 
                        ? activeScenario.satellite_imagery.rgb_preview_url 
                        : activeScenario.satellite_imagery.swir_preview_url
                      }
                      alt="Sentinel-2 Composite"
                      className="w-full h-full object-cover"
                    />

                    {/* CNN Segmentation Mask Overlay */}
                    {satelliteViewMode === 'mask' && activeScenario.cnn_verification && (
                      <div className="absolute inset-0 bg-purple-950/30 flex items-center justify-center pointer-events-none">
                        <div className="text-center p-3 rounded bg-black/80 border border-purple-500/60 font-mono text-xs text-purple-300">
                          <p className="font-bold">Active Combustion Perimeter Isolated</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {activeScenario.cnn_verification.fire_footprint.active_pixel_count} Active Pixels (~{activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m²)
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                      {satelliteViewMode === 'rgb' ? 'B04-B03-B02 (Natural Optical)' : satelliteViewMode === 'swir' ? 'B12-B08-B04 (SWIR False Color)' : 'U-Net CNN Segmentation'}
                    </div>
                  </div>

                  {/* CNN Decision Output */}
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
                          <span className="text-slate-400">Confidence Score:</span>
                          <span className="font-bold text-amber-400">{(activeScenario.cnn_verification.confidence * 100).toFixed(1)}%</span>
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
                      <p className="text-[11px] text-slate-400 italic">
                        {activeScenario.cnn_verification.explanation}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-600 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                Run a simulation scenario to trigger high-resolution Sentinel-2 STAC querying and CNN verification.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Status Ticker */}
      <footer className="h-8 border-t border-slate-800 bg-slate-950 px-4 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>PostGIS 16: Active</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Stage 1 LightGBM: Sub-5ms Ready</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            <span>Stage 3 Multi-Spectral CNN: Armed</span>
          </span>
        </div>
        <span>AURA-Fire Engine v1.1.0 (NTRO SIH-26162)</span>
      </footer>
    </div>
  );
}
