import { useState, useEffect } from 'react';
import { 
  Satellite, 
  Layers, 
  Zap, 
  Crosshair, 
  Sun,
  Activity,
  MapPin,
  TrendingUp,
  Volume2,
  VolumeX,
  FileText,
  Wifi,
  Wind
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
      wind_speed_m_s: number;
      wind_direction_deg: number;
      stability_class: string;
    };
  };
  live_weather?: {
    wind_speed_10m: number;
    wind_direction_10m: number;
    temperature_2m: number;
    computed_stability_class: string;
    source: string;
  };
  chemical_profile?: {
    chemical_type: string;
    name?: string;
    primary_hazard: string;
    idlh_ppm: number;
    erpg2_ppm: number;
    computed_emission_rate_g_s: number;
  };
  population_impact?: {
    total_estimated_exposed: number;
    zone_breakdown: Record<string, number>;
  };
  xai_feature_attributions?: Array<{
    feature: string;
    value: number;
    baseline: number;
    contribution: number;
    direction: string;
  }>;
  available_chemicals?: string[];
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
  
  // P4: WebSocket State
  const [wsConnected, setWsConnected] = useState(false);
  const [wsSocket, setWsSocket] = useState<WebSocket | null>(null);

  // P2: What-If Sandbox State
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [whatIfParams, setWhatIfParams] = useState({
    chemical_type: 'GENERIC',
    wind_speed_m_s: 5.2,
    wind_direction_deg: 235,
    explosion_frp_mw: 120
  });

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

  // WebSocket Connection Logic
  useEffect(() => {
    if (!wsConnected) {
      if (wsSocket) {
        wsSocket.close();
        setWsSocket(null);
      }
      return;
    }

    const wsUrl = `ws://localhost:8000/api/v1/ws/tactical-feed`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Tactical WebSocket Connected');
      setWsSocket(ws);
      // Focus scan on current facility
      ws.send(JSON.stringify({ cmd: 'set_facility_focus', facility: selectedFacility.key }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'INCIDENT_ALERT') {
        playRedAlert();
        setActiveScenario(data as SimulationResult);
        setCurrentTimelineStage(2);
      } else if (data.type === 'THERMAL_SCAN' && !activeScenario?.triage_result || (activeScenario?.triage_result?.class_id === 0)) {
        // Just update baseline if we're not currently looking at an explosion
        // (In a real app, this would update a ticker, but we can set it as active baseline)
        if (!whatIfMode && currentTimelineStage === 0 && data.facility_key === selectedFacility.key) {
           // setActiveScenario(data as SimulationResult); 
           // Optional: smooth updates to baseline, but skip to avoid flashing
        }
      }
    };

    ws.onclose = () => {
      console.log('Tactical WebSocket Disconnected');
      setWsConnected(false);
      setWsSocket(null);
    };

    return () => {
      ws.close();
    };
  }, [wsConnected, selectedFacility.key]);

  const toggleAudio = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    setAudioMuted(newMuted);
  };

  const triggerBaselineProof = async (facilityKey: string = selectedFacility.key) => {
    setLoading(true);
    setWhatIfMode(false);
    playRadarPing();
    setCurrentTimelineStage(0);
    try {
      const res = await fetch(`${API_BASE}/simulation/baseline-proof?facility=${facilityKey}`);
      const data = await res.json();
      setActiveScenario(data);
      setWhatIfParams(prev => ({ ...prev, chemical_type: data.available_chemicals?.[0] || 'GENERIC' }));
      playConfirmTone();
    } catch (err) {
      console.error('API baseline fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerIncidentInjection = async (facilityKey: string = selectedFacility.key) => {
    setLoading(true);
    setWhatIfMode(false);
    playRedAlert();
    setCurrentTimelineStage(1);
    
    if (wsConnected && wsSocket) {
      // Trigger via WebSocket if connected
      wsSocket.send(JSON.stringify({ cmd: 'inject_incident', facility: facilityKey }));
      setTimeout(() => setLoading(false), 500);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/simulation/inject-explosion?facility=${facilityKey}&chemical_type=${whatIfParams.chemical_type}`, { method: 'POST' });
      const data = await res.json();
      setActiveScenario(data);
      if (data.live_weather) {
        setWhatIfParams(prev => ({
          ...prev,
          wind_speed_m_s: data.live_weather.wind_speed_10m || 5.2,
          wind_direction_deg: data.live_weather.wind_direction_10m || 235
        }));
      }
      setTimeout(() => setCurrentTimelineStage(2), 1500);
      setTimeout(() => setCurrentTimelineStage(3), 3500);
    } catch (err) {
      console.error('API explosion injection error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadDossier = async () => {
    if (!activeScenario || activeScenario.scenario.includes('BASELINE')) return;
    try {
      const res = await fetch(`${API_BASE}/dossier/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility: selectedFacility.key, scenario: 'structural_explosion' })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NDRF_Dossier_${selectedFacility.key}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download dossier', err);
    }
  };

  // What-If Debounced Effect
  useEffect(() => {
    if (!whatIfMode || loading) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/simulation/what-if`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facility: selectedFacility.key,
            wind_speed_m_s: whatIfParams.wind_speed_m_s,
            wind_direction_deg: whatIfParams.wind_direction_deg,
            chemical_type: whatIfParams.chemical_type,
            explosion_frp_mw: whatIfParams.explosion_frp_mw,
            stability_class: activeScenario?.live_weather?.computed_stability_class || 'C'
          })
        });
        const data = await res.json();
        
        // Merge into active scenario
        setActiveScenario(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            chemical_profile: data.chemical_profile,
            plume_dispersion: data.plume_dispersion,
            population_impact: data.population_impact,
            triage_result: data.triage_result || prev.triage_result,
            cnn_verification: data.cnn_verification || prev.cnn_verification
          };
        });
      } catch (err) {
        console.error('What-If simulation failed', err);
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [whatIfParams, whatIfMode, selectedFacility.key]);

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
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      {/* Sleek Enterprise Top Navigation */}
      <header className="h-16 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="p-2 bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 rounded-xl text-zinc-300 shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-3">
              AURA-Fire Platform
              <span className="text-[10px] font-medium tracking-wider uppercase px-2 py-0.5 bg-zinc-800/80 text-zinc-400 rounded-full">
                Intelligence
              </span>
            </h1>
            <p className="text-xs text-zinc-500 font-medium flex items-center gap-2 mt-0.5">
              <span>Operational Spatio-Temporal System</span>
              <span className="text-zinc-700">•</span>
              <span className="text-zinc-400">{currentTimeUTC}</span>
            </p>
          </div>
        </div>

          {/* Minimalist Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setWsConnected(!wsConnected)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition duration-200 border ${
                wsConnected 
                  ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
              }`}
            >
              <Wifi className={`w-3.5 h-3.5 ${wsConnected ? 'animate-pulse' : ''}`} />
              <span>{wsConnected ? 'Live Stream Active' : 'Start Feed'}</span>
            </button>

            <button
              onClick={() => triggerBaselineProof(selectedFacility.key)}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition duration-200"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Baseline Proof</span>
            </button>
            
            <button
              onClick={() => triggerIncidentInjection(selectedFacility.key)}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white border border-red-500/20 shadow-sm transition duration-200"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Inject Incident</span>
            </button>

            {isExplosion && (
              <button
                onClick={downloadDossier}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition duration-200 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Dossier</span>
              </button>
            )}

            <button
              onClick={triggerFalseGlareTest}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition duration-200"
            >
              <Sun className="w-3.5 h-3.5 text-zinc-400" />
              <span>Test Glare</span>
            </button>

            <button
              onClick={toggleAudio}
              className={`p-2 rounded-xl border transition duration-200 ${
                muted 
                  ? 'bg-zinc-950 text-zinc-600 border-zinc-800/60' 
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </header>

      {/* Elegant Facility Switcher Ribbon */}
      <div className="bg-zinc-950 border-b border-zinc-800/40 px-6 py-2 shrink-0">
        <FacilitySelector
          selectedKey={selectedFacility.key}
          onSelect={handleFacilitySelect}
          disabled={loading}
        />
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Half: Map Canvas */}
        <div className="flex-1 relative flex flex-col border-r border-zinc-800/60">
          {/* Map Sub-Header Bar */}
          <div className="h-10 px-6 bg-zinc-950 border-b border-zinc-800/40 flex items-center justify-between z-10 text-xs text-zinc-400 font-medium">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-300">{selectedFacility.company}</span>
              <span className="text-zinc-600">•</span>
              <span>{selectedFacility.name} ({selectedFacility.state})</span>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-3.5 h-3.5 text-zinc-500" />
              <span>{currentCoords[0].toFixed(4)}°N, {currentCoords[1].toFixed(4)}°E</span>
            </div>
          </div>

          {/* High-Resolution Map */}
          <div className="flex-1 relative">
            <TacticalMap
              targetCoords={currentCoords}
              targetName={selectedFacility.key}
              isExplosion={isExplosion}
              plumeData={activeScenario?.plume_dispersion || null}
              liveWeather={activeScenario?.live_weather || null}
              onSelectFacility={handleFacilitySelect}
            />

            {/* P2: What-If Digital Twin Sandbox Overlay */}
            {isExplosion && (
              <div className="absolute top-6 left-6 z-[500] w-80 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="bg-zinc-800/40 px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                    <Wind className="w-4 h-4 text-zinc-400" />
                    Interactive Sandbox
                  </span>
                  <button 
                    onClick={() => setWhatIfMode(!whatIfMode)}
                    className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition ${whatIfMode ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                  >
                    {whatIfMode ? 'Active' : 'Enable'}
                  </button>
                </div>
                
                {whatIfMode && (
                  <div className="p-4 space-y-4 text-xs font-medium">
                    <div className="space-y-1.5">
                      <label className="text-zinc-400 flex justify-between">
                        <span>Chemical Profile</span>
                      </label>
                      <select 
                        value={whatIfParams.chemical_type}
                        onChange={(e) => setWhatIfParams(p => ({ ...p, chemical_type: e.target.value }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:border-zinc-600 transition"
                      >
                        {(activeScenario?.available_chemicals || ['GENERIC']).map(chem => (
                          <option key={chem} value={chem}>{chem.replace(/_/g, ' ')}</option>
                        ))}
                        <option value="BENZENE">BENZENE</option>
                        <option value="AMMONIA">AMMONIA</option>
                        <option value="CHLORINE">CHLORINE</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-zinc-400 flex justify-between">
                        <span>Wind Speed</span>
                        <span className="text-zinc-100">{whatIfParams.wind_speed_m_s} m/s</span>
                      </label>
                      <input 
                        type="range" min="0" max="25" step="0.5"
                        value={whatIfParams.wind_speed_m_s}
                        onChange={(e) => setWhatIfParams(p => ({ ...p, wind_speed_m_s: parseFloat(e.target.value) }))}
                        className="w-full accent-zinc-400"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-zinc-400 flex justify-between">
                        <span>Wind Direction</span>
                        <span className="text-zinc-100">{whatIfParams.wind_direction_deg}°</span>
                      </label>
                      <input 
                        type="range" min="0" max="360" step="5"
                        value={whatIfParams.wind_direction_deg}
                        onChange={(e) => setWhatIfParams(p => ({ ...p, wind_direction_deg: parseFloat(e.target.value) }))}
                        className="w-full accent-zinc-400"
                      />
                    </div>
                    
                    {activeScenario?.population_impact && (
                      <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 rounded-xl flex justify-between items-center">
                        <span className="text-zinc-400">Est. Pop at Risk:</span>
                        <span className="text-red-400 font-semibold">{activeScenario.population_impact.total_estimated_exposed.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Incident Timeline Scrubber */}
          <IncidentTimeline
            currentStage={currentTimelineStage}
            onSelectStage={handleTimelineSelect}
            disabled={loading}
          />
        </div>

        {/* Right Half: Intelligence Panel */}
        <aside className="w-[520px] bg-zinc-950 flex flex-col overflow-y-auto shrink-0">
          {/* Intelligence Panel Header */}
          <div className="px-6 py-5 bg-zinc-950 border-b border-zinc-800/40 sticky top-0 z-10">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-zinc-400" />
              <span>Spatio-Temporal Telemetry</span>
            </h2>
            <p className="text-[11px] font-medium text-zinc-500 mt-1">
              National AI Triage System • VIIRS 375m & Sentinel-2
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Section 1: Tier 1 Triage */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Tier 1: Triage Decision
                </h3>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {activeScenario?.triage_result.inference_time_ms || 0.008} ms
                </span>
              </div>

              {/* Classification Outcome Card */}
              <div className={`p-5 rounded-2xl border ${
                isExplosion
                  ? 'bg-red-950/10 border-red-900/30 shadow-sm'
                  : 'bg-emerald-950/10 border-emerald-900/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide uppercase ${
                    isExplosion ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {activeScenario?.triage_result.class_tag}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">
                    Confidence: {((activeScenario?.triage_result.confidence || 0.96) * 100).toFixed(1)}%
                  </span>
                </div>
                <h4 className="font-semibold text-sm text-zinc-100">{activeScenario?.triage_result.category}</h4>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {activeScenario?.triage_result.action_details}
                </p>
              </div>

              {/* Mathematical Anomaly Indices Grid */}
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">FRP (MW)</span>
                  <span className="text-sm font-semibold text-zinc-200">{activeScenario?.telemetry.frp}</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">TAI Z-Score</span>
                  <span className={`text-sm font-semibold ${isExplosion ? 'text-red-400' : 'text-zinc-200'}`}>
                    +{activeScenario?.triage_result.features.tai.toFixed(1)}σ
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">SPF</span>
                  <span className="text-sm font-semibold text-zinc-200">{activeScenario?.triage_result.features.spf}</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">Band I4</span>
                  <span className="text-sm font-semibold text-zinc-200">{activeScenario?.telemetry.bright_ti4} K</span>
                </div>
              </div>

              {/* Historical FRP Baseline vs Spike Chart */}
              <div className="pt-2">
                <span className="text-[11px] font-medium text-zinc-400 block mb-2 flex items-center justify-between">
                  <span>Continuous FRP Baseline</span>
                  <span className="text-zinc-600">Threshold: +2.5σ</span>
                </span>
                <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-3">
                  <TelemetryChart 
                    isExplosion={isExplosion} 
                    facilityName={selectedFacility.name} 
                  />
                </div>
              </div>
              
              {/* P5: XAI Feature Attributions */}
              {activeScenario?.xai_feature_attributions && (
                <div className="pt-3">
                  <span className="text-[11px] font-medium text-zinc-400 block mb-2">
                    SHAP Explainability Audit
                  </span>
                  <div className="grid grid-cols-1 gap-1.5 border border-zinc-800/50 rounded-xl bg-zinc-900/20 p-3 text-[10px] font-medium">
                    {activeScenario.xai_feature_attributions.map((attr, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-zinc-400 w-24 truncate">{attr.feature}</span>
                        <div className="flex-1 mx-3 bg-zinc-800 h-1 rounded-full overflow-hidden flex">
                          {attr.contribution > 0 ? (
                            <div className="bg-red-400 h-full" style={{ width: `${Math.min(100, attr.contribution * 100)}%`, marginLeft: 'auto' }} />
                          ) : (
                            <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, Math.abs(attr.contribution) * 100)}%` }} />
                          )}
                        </div>
                        <span className={`w-10 text-right ${attr.contribution > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {attr.contribution > 0 ? '+' : ''}{(attr.contribution).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-zinc-800/50 w-full" />

            {/* Section 2: Tier 2 CNN Verification */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Satellite className="w-3.5 h-3.5" />
                  Tier 2: CNN Verification
                </h3>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Sentinel-2 SWIR
                </span>
              </div>

              {/* Multi-Spectral Imagery Card */}
              {activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION_QUEUED" ? (
                <div className="p-8 text-center bg-zinc-900/30 border border-zinc-800/60 rounded-2xl space-y-3">
                  <Satellite className="w-6 h-6 text-zinc-400 animate-pulse mx-auto" />
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200 mb-1">Inference Queued</h4>
                    <p className="text-xs text-zinc-500">
                      Processing high-resolution deep learning models<br/>on distributed compute cluster...
                    </p>
                  </div>
                </div>
              ) : activeScenario?.satellite_imagery ? (
                <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>64x64 px Patch</span>
                    </span>
                    
                    {/* View Mode Tabs */}
                    <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800/80 text-[10px] font-medium">
                      <button
                        onClick={() => setSatelliteViewMode('swir')}
                        className={`px-2.5 py-1 rounded-md transition ${
                          satelliteViewMode === 'swir' 
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        SWIR Heat
                      </button>
                      <button
                        onClick={() => setSatelliteViewMode('rgb')}
                        className={`px-2.5 py-1 rounded-md transition ${
                          satelliteViewMode === 'rgb' 
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Optical RGB
                      </button>
                      <button
                        onClick={() => setSatelliteViewMode('mask')}
                        className={`px-2.5 py-1 rounded-md transition ${
                          satelliteViewMode === 'mask' 
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        CNN Mask
                      </button>
                    </div>
                  </div>

                  {/* Satellite Image Display */}
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-950 flex items-center justify-center">
                    <img 
                      src={satelliteViewMode === 'rgb' 
                        ? activeScenario.satellite_imagery.rgb_preview_url 
                        : activeScenario.satellite_imagery.swir_preview_url
                      }
                      alt="Sentinel-2 Satellite Imagery"
                      className="w-full h-full object-cover opacity-90"
                    />

                    {/* CNN Mask Overlay */}
                    {satelliteViewMode === 'mask' && activeScenario.cnn_verification && (
                      <div className="absolute inset-0 bg-indigo-950/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                        <div className="text-center p-4 rounded-xl bg-zinc-950/90 border border-indigo-500/30 text-indigo-200 shadow-xl">
                          <p className="text-xs font-semibold text-indigo-300 mb-1">Combustion Core Isolated</p>
                          <p className="text-[11px] text-zinc-400">
                            {activeScenario.cnn_verification.fire_footprint.active_pixel_count} Active Pixels<br/>
                            ~{activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m²
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 bg-zinc-950/80 backdrop-blur-md px-2 py-1 rounded-md text-[9px] font-medium text-zinc-400 border border-zinc-800/50">
                      {satelliteViewMode === 'rgb' 
                        ? 'B04-B03-B02 (Natural Visible)' 
                        : satelliteViewMode === 'swir' 
                          ? 'B12-B08-B04 (SWIR False Color)' 
                          : 'AuraFire Multi-Spectral Segmentation'}
                    </div>
                  </div>

                  {/* CNN Metrics Details */}
                  {activeScenario.cnn_verification && (
                    <div className="space-y-2.5 pt-2 text-xs">
                      <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/60 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 font-medium">CNN Classification:</span>
                          <span className={`font-semibold ${activeScenario.cnn_verification.is_verified_fire ? 'text-red-400' : 'text-emerald-400'}`}>
                            {activeScenario.cnn_verification.prediction_class.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 font-medium">Model Confidence:</span>
                          <span className="font-semibold text-zinc-200">{(activeScenario.cnn_verification.confidence * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 font-medium">Max SWIR Reflectance:</span>
                          <span className="font-semibold text-zinc-200">{activeScenario.cnn_verification.fire_footprint.max_swir_reflectance.toFixed(3)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 font-medium">Verified Fire Area:</span>
                          <span className="font-semibold text-zinc-200">
                            {activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m² ({activeScenario.cnn_verification.fire_footprint.fire_area_hectares} ha)
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-zinc-800/60 pt-2 mt-2">
                          <span className="text-zinc-400 font-medium">System Action:</span>
                          <span className="font-semibold text-zinc-200">{activeScenario.cnn_verification.action}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 italic bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/50">
                        {activeScenario.cnn_verification.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center bg-zinc-900/30 border border-zinc-800/60 rounded-2xl">
                  <p className="text-xs text-zinc-500 font-medium">Awaiting High-Resolution Satellite Pass...</p>
                </div>
              )}
            </div>
            
            {/* Actionable Notes / Demo Logs */}
            {activeScenario?.demo_notes && (
              <>
                <div className="h-px bg-zinc-800/50 w-full" />
                <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 border-l-4 border-l-indigo-500 shadow-sm">
                  <h4 className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">Analyst Notes</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                    {activeScenario.demo_notes}
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Elegant Bottom Status Ticker */}
      <footer className="h-8 border-t border-zinc-800/60 bg-zinc-950 px-6 flex items-center justify-between text-[10px] font-medium text-zinc-500 shrink-0">
        <div className="flex items-center space-x-6">
          <span className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>National Corpus: 50,000 Trained Points (RIL, IOCL, ONGC, SAIL)</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>Tier 1 LightGBM (F1: 0.9999 | 0.176 ms)</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
            <span>Tier 2 Sentinel-2 CNN: Active</span>
          </span>
        </div>
        <span className="text-zinc-600">AURA-Fire Platform v2.0.0 (NTRO SIH-26162)</span>
      </footer>
    </div>
  );
}
