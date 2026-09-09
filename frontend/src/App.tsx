import { useState, useEffect } from 'react';
import { 
  Flame, 
  Satellite, 
  Layers, 
  Play, 
  Zap, 
  Crosshair, 
  Sun,
  Activity,
  MapPin,
  TrendingUp,
  Volume2,
  VolumeX,
  Radio
} from 'lucide-react';
import { TacticalMap } from './components/TacticalMap';
import { TelemetryChart } from './components/TelemetryChart';
import { FacilitySelector, CorporateFacility, CORPORATE_FACILITIES } from './components/FacilitySelector';
import { IncidentTimeline } from './components/IncidentTimeline';
import { playRadarPing, playRedAlert, playConfirmTone, setAudioMuted } from './services/audioFx';

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
  const [selectedFacility, setSelectedFacility] = useState<CorporateFacility>(CORPORATE_FACILITIES[0]);
  const [loading, setLoading] = useState(false);
  const [satelliteViewMode, setSatelliteViewMode] = useState<'swir' | 'rgb' | 'mask'>('swir');
  const [muted, setMuted] = useState(false);
  const [currentTimelineStage, setCurrentTimelineStage] = useState(0);
  const [currentTimeUTC, setCurrentTimeUTC] = useState('');

  // Live ticking UTC mission elapsed clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeUTC(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load default baseline on startup
  useEffect(() => {
    triggerBaselineProof(CORPORATE_FACILITIES[0].key);
  }, []);

  const toggleAudio = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    setAudioMuted(newMuted);
  };

  const triggerBaselineProof = async (facilityKey: string = selectedFacility.key) => {
    setLoading(true);
    playRadarPing();
    setCurrentTimelineStage(0);
    try {
      const res = await fetch(`${API_BASE}/simulation/baseline-proof?facility=${facilityKey}`);
      const data = await res.json();
      setActiveScenario(data);
      playConfirmTone();
    } catch (err) {
      console.error('API baseline fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerIncidentInjection = async (facilityKey: string = selectedFacility.key) => {
    setLoading(true);
    playRedAlert();
    setCurrentTimelineStage(1);
    try {
      const res = await fetch(`${API_BASE}/simulation/inject-explosion?facility=${facilityKey}`, { method: 'POST' });
      const data = await res.json();
      setActiveScenario(data);
      // Advance timeline automatically to step 2 after 1.5s
      setTimeout(() => setCurrentTimelineStage(2), 1500);
      // Advance to step 3 after 3.5s
      setTimeout(() => setCurrentTimelineStage(3), 3500);
    } catch (err) {
      console.error('API explosion injection error:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFalseGlareTest = async () => {
    setLoading(true);
    playRadarPing();
    setCurrentTimelineStage(0);
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
          category: "Specular Optical Glare (False Alarm Dismissed)",
          action: "DISMISS_FALSE_ALARM",
          action_details: "Optical glare rejected by Stage 3 Multi-Spectral CNN. Positive NBR confirms no combustion core.",
          severity: "NORMAL",
          confidence: 0.94,
          inference_time_ms: 0.007,
          features: { frp: 38.4, tai: 1.8, spf: 0.15, bright_ti4: 342.0 }
        },
        cnn_verification: data.cnn_verification,
        satellite_imagery: data.satellite_imagery,
        demo_notes: "High solar / roof reflection triggered thermal threshold, but Stage 3 Multi-Spectral CNN successfully verified positive NBR and dismissed the false alarm."
      });
      playConfirmTone();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFacilitySelect = (facility: CorporateFacility) => {
    setSelectedFacility(facility);
    triggerBaselineProof(facility.key);
  };

  const handleTimelineSelect = (stage: number) => {
    setCurrentTimelineStage(stage);
    if (stage === 0) {
      triggerBaselineProof(selectedFacility.key);
    } else if (stage >= 1) {
      triggerIncidentInjection(selectedFacility.key);
    }
  };

  const isExplosion = activeScenario?.triage_result?.class_id === 1;
  const currentCoords: [number, number] = activeScenario?.coordinates
    ? [activeScenario.coordinates.lat, activeScenario.coordinates.lon]
    : selectedFacility.coords;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* Tactical Top Navigation Bar (War Room Style) */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-5 flex items-center justify-between z-20 shrink-0">
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
                  WAR ROOM ONLINE
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>Operational Spatio-Temporal Intelligence System</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400">{currentTimeUTC}</span>
            </p>
          </div>
        </div>

        {/* Demo Simulation Controls & Audio Toggle */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => triggerBaselineProof(selectedFacility.key)}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow transition active:scale-95"
            title="Step 1: Baseline Proof (Zero false alarms on routine flaring)"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Baseline Proof</span>
          </button>
          
          <button
            onClick={() => triggerIncidentInjection(selectedFacility.key)}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-red-950 hover:bg-red-900 text-red-200 border border-red-700 shadow-lg shadow-red-950/40 transition active:scale-95"
            title="Step 2: Inject sudden 120MW industrial thermal explosion"
          >
            <Zap className="w-4 h-4 text-red-400 animate-bounce" />
            <span>2. Inject 120MW Explosion</span>
          </button>

          <button
            onClick={triggerFalseGlareTest}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800 shadow transition active:scale-95"
            title="Step 3: Demonstrate CNN rejection of specular optical glare"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Test Solar Glare</span>
          </button>

          {/* Audio FX Mute / Unmute Toggle */}
          <button
            onClick={toggleAudio}
            className={`p-2 rounded-lg border transition ${
              muted 
                ? 'bg-slate-900 text-slate-500 border-slate-800' 
                : 'bg-slate-800 text-cyan-400 border-slate-700 shadow-sm'
            }`}
            title={muted ? 'Unmute Tactical Audio FX' : 'Mute Tactical Audio FX'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Corporate Facility Switcher Ribbon */}
      <div className="bg-slate-900/80 border-b border-slate-800/80 px-4 py-1.5 shrink-0">
        <FacilitySelector
          selectedKey={selectedFacility.key}
          onSelect={handleFacilitySelect}
          disabled={loading}
        />
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Half: Tactical Map Canvas */}
        <div className="flex-1 relative flex flex-col border-r border-slate-800">
          {/* Map Sub-Header Bar */}
          <div className="h-9 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 font-mono text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white uppercase">{selectedFacility.company}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">{selectedFacility.name} ({selectedFacility.state})</span>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              <span className="text-cyan-300 font-bold">{currentCoords[0].toFixed(4)}°N, {currentCoords[1].toFixed(4)}°E</span>
            </div>
          </div>

          {/* High-Resolution Satellite & Tactical Dark Map */}
          <div className="flex-1 relative">
            <TacticalMap
              targetCoords={currentCoords}
              targetName={selectedFacility.name}
              isExplosion={isExplosion}
              plumeData={activeScenario?.plume_dispersion || null}
              onSelectFacility={handleFacilitySelect}
            />
          </div>

          {/* Incident Timeline Scrubber */}
          <IncidentTimeline
            currentStage={currentTimelineStage}
            onSelectStage={handleTimelineSelect}
            disabled={loading}
          />
        </div>

        {/* Right Half: Tactical Triage & Deep-Learning Intelligence Panel */}
        <aside className="w-[490px] bg-slate-950 flex flex-col border-l border-slate-800 overflow-y-auto shrink-0 divide-y divide-slate-800/80">
          {/* Panel Header */}
          <div className="p-3.5 bg-slate-900/70 flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>National AI Triage Telemetry</span>
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 flex items-center gap-1">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>VIIRS 375m Telemetry</span>
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
                facilityName={selectedFacility.name} 
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

      {/* Bottom Status Ticker */}
      <footer className="h-8 border-t border-slate-800 bg-slate-950 px-5 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center space-x-5">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>National Corpus: 50,000 Trained Points (RIL, IOCL, ONGC, SAIL)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Tier 1 LightGBM (F1: 0.9999 | 0.176 ms)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            <span>Tier 2 Sentinel-2 CNN: Active</span>
          </span>
        </div>
        <span className="text-slate-500">AURA-Fire Engine v2.0.0 (NTRO SIH-26162)</span>
      </footer>
    </div>
  );
}
