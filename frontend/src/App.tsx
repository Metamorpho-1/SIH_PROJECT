import { useState, useEffect } from 'react';
import { 
  Satellite, 
  Zap, 
  Crosshair, 
  Sun,
  Activity,
  MapPin,
  Volume2,
  VolumeX,
  FileText,
  Wifi,
  AlertTriangle
} from 'lucide-react';
import { BeforeAfterSlider } from './components/BeforeAfterSlider';
import { TacticalMap } from './components/TacticalMap';
import { TelemetryChart } from './components/TelemetryChart';
import { FacilitySelector, CorporateFacility, CORPORATE_FACILITIES } from './components/FacilitySelector';
import { IncidentTimeline } from './components/IncidentTimeline';
import { playRadarPing, playRedAlert, playConfirmTone, setAudioMuted } from './services/audioFx';
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedCounter } from './components/AnimatedCounter';
import { TypewriterText } from './components/TypewriterText';

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
    descriptive_analysis?: string;    fire_footprint: {
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
  const [showFirms, setShowFirms] = useState(false);
  const [loadingFirms, setLoadingFirms] = useState(false);
  const [liveFirmsData, setLiveFirmsData] = useState<any[]>([]);
  const [satelliteViewMode, setSatelliteViewMode] = useState<'swir' | 'rgb' | 'mask'>('swir');
  const [muted, setMuted] = useState(false);
  const [currentTimelineStage, setCurrentTimelineStage] = useState(0);
  const [currentTimeUTC, setCurrentTimeUTC] = useState('');
  const [taskStatus, setTaskStatus] = useState<{status: string, step: string, progress: number} | null>(null);  
  const [baselineImagery, setBaselineImagery] = useState<any>(null);  // P4: WebSocket State
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
        setTimeout(() => {
          setCurrentTimelineStage(3);
        }, 2000); // 2 second delay so user sees CNN results before plume
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
      setBaselineImagery(data.satellite_imagery);      setWhatIfParams(prev => ({ ...prev, chemical_type: data.available_chemicals?.[0] || 'GENERIC' }));
      playConfirmTone();
    } catch (err) {
      console.error('API baseline fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFirmsIncident = (point: {lat: number, lon: number, frp: number}) => {
    if (window.confirm(`Coarse-Resolution Anomaly Detected at ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)} (FRP: ${point.frp} MW).\n\nDelegate to Aura-Fire for High-Res Verification?`)) {
      setWhatIfParams(prev => ({
        ...prev,
        explosion_frp_mw: point.frp
      }));
      triggerIncidentInjection();
    }
  };
  const triggerIncidentInjection = async (facilityKey: string = selectedFacility.key) => {
    setLoading(true);
    setWhatIfMode(false);
    playRedAlert();
    setCurrentTimelineStage(1);
    
    try {
      const res = await fetch(`${API_BASE}/simulation/inject-explosion?facility=${facilityKey}&chemical_type=${whatIfParams.chemical_type}&wind_speed=${whatIfParams.wind_speed_m_s}&wind_direction=${whatIfParams.wind_direction_deg}&explosion_frp=${whatIfParams.explosion_frp_mw}`, { method: 'POST' });
      const data = await res.json();
      setActiveScenario(data);
      if (data.live_weather) {
        setWhatIfParams(prev => ({
          ...prev,
          wind_speed_m_s: data.live_weather.wind_speed_10m || 5.2,
          wind_direction_deg: data.live_weather.wind_direction_10m || 235
        }));
      }
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
  // Poll Celery Task Status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION_QUEUED" && (activeScenario as any).task_id) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/simulation/task-status/${(activeScenario as any).task_id}`);
          const data = await res.json();
          setTaskStatus(data);
          
          // Fallback in case WebSocket is disconnected: if backend says SUCCESS, apply the result directly
          if (data.status === 'SUCCESS' && data.result) {
            playRedAlert();
            setActiveScenario(data.result);
            setCurrentTimelineStage(2);
            setTimeout(() => {
              setCurrentTimelineStage(3);
            }, 2000);
          }
        } catch (err) {
          console.error('Failed to fetch task status', err);
        }
      }, 500);
    } else {
      setTaskStatus(null);
    }
    return () => clearInterval(interval);
  }, [activeScenario]);
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
          action_details: "Optical glare rejected by Stage 3 Spectral Analysis. Positive NBR confirms no combustion core.",
          severity: "NORMAL",
          confidence: 0.94,
          inference_time_ms: 0.007,
          features: { frp: 38.4, tai: 1.8, spf: 0.15, bright_ti4: 342.0 }
        },
        cnn_verification: data.cnn_verification,
        satellite_imagery: data.satellite_imagery,
        demo_notes: "High solar / roof reflection triggered thermal threshold, but Stage 3 Spectral Analysis successfully verified positive NBR and dismissed the false alarm."
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
    if (stage === 0) {
      setCurrentTimelineStage(0);
      triggerBaselineProof(selectedFacility.key);
    } else if (stage >= 1) {
      if (currentTimelineStage === 0) {
        triggerIncidentInjection(selectedFacility.key);
      } else {
        if (activeScenario?.scenario !== "INCIDENT_SIMULATION_EXPLOSION_QUEUED") {
          setCurrentTimelineStage(stage);
        }
      }
    }
  };

  const isExplosion = activeScenario?.triage_result?.class_id === 1;
  const currentCoords: [number, number] = activeScenario?.coordinates
    ? [activeScenario.coordinates.lat, activeScenario.coordinates.lon]
    : selectedFacility.coords;

  const fetchLiveFirmsData = async () => {
    if (showFirms) {
      setShowFirms(false);
      setLiveFirmsData([]);
      return;
    }
    
    setLoadingFirms(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/live-firms`);
      const data = await res.json();
      setLiveFirmsData(data);
      setShowFirms(true);
    } catch (err) {
      console.error('Failed to fetch live FIRMS data:', err);
    } finally {
      setLoadingFirms(false);
    }
  };

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  return (
    <div 
      className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none bg-grain"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Dynamic Background Spotlight */}
      <div 
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.03), transparent 40%)`
        }}
      />

      {/* Sleek Enterprise Top Navigation */}
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-2xl px-8 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center justify-center p-1 bg-zinc-900 border border-white/5 rounded-lg overflow-hidden h-9 w-9">
            <img src="/vulcan-logo.png" alt="Vulcan Grid Logo" className="w-full h-full object-contain grayscale opacity-80" />
          </div>
          <div>
            <h1 className="text-sm font-medium tracking-[0.2em] text-zinc-100 flex items-center gap-3">
              VULCAN GRID
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium tracking-widest mt-0.5 uppercase">
              {currentTimeUTC}
            </p>
          </div>
        </div>

          {/* Minimalist Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLiveFirmsData}
              disabled={loadingFirms}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-medium transition-all duration-300 border ${
                showFirms 
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
                  : 'bg-transparent hover:bg-white/5 text-zinc-400 border-transparent hover:border-white/10'
              }`}
            >
              <Satellite className={`w-3 h-3 ${loadingFirms ? 'animate-spin' : showFirms ? 'animate-pulse' : ''}`} />
              <span>{loadingFirms ? 'Fetching...' : showFirms ? 'FIRMS Live' : 'Live Map'}</span>
            </button>

            <div className="w-px h-4 bg-white/10 mx-2" />

            <button
              onClick={() => setWsConnected(!wsConnected)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-medium transition-all duration-300 border ${
                wsConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-transparent hover:bg-white/5 text-zinc-400 border-transparent hover:border-white/10'
              }`}
            >
              <Wifi className={`w-3 h-3 ${wsConnected ? 'animate-pulse' : ''}`} />
              <span>{wsConnected ? 'Connected' : 'Connect'}</span>
            </button>

            <button
              onClick={() => triggerBaselineProof(selectedFacility.key)}
              disabled={loading}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-medium bg-transparent hover:bg-white/5 text-zinc-300 border border-transparent hover:border-white/10 transition-all duration-300 ml-2"
            >
              <Activity className="w-3 h-3" />
              <span>Baseline</span>
            </button>
            
            <button
              onClick={() => triggerIncidentInjection(selectedFacility.key)}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-1.5 ml-2 rounded-md text-[11px] uppercase tracking-wider font-semibold bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 transition-all duration-300"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Inject Incident</span>
            </button>

            {activeScenario && (
              <button
                onClick={downloadDossier}
                className="flex items-center space-x-2 px-3 py-1.5 ml-2 rounded-md text-[11px] uppercase tracking-wider font-semibold bg-white hover:bg-zinc-200 text-black transition-all duration-300 shadow-sm"
              >
                <FileText className="w-3 h-3" />
                <span>Export</span>
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
              targetCoords={selectedFacility.coords}
              targetName={selectedFacility.name}
              isExplosion={activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION" || activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION_QUEUED" || (whatIfMode && !!activeScenario?.plume_dispersion)}
              plumeData={activeScenario?.plume_dispersion}
              liveWeather={activeScenario?.live_weather}
              liveFirmsData={showFirms ? liveFirmsData : null}
              onSelectFacility={(facility) => {
                setSelectedFacility(facility);
                triggerBaselineProof(facility.key);
              }}
              onFirmsClick={triggerFirmsIncident}
            />

            {/* P2: What-If Digital Twin Sandbox Overlay */}
            <div className="absolute top-6 left-6 z-[500] w-80 bg-black/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col">
              <div className="bg-black/60 backdrop-blur-md px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-[0.15em] text-zinc-300 uppercase flex items-center gap-2">
                  Parameters
                </span>
                <button 
                  onClick={() => setWhatIfMode(!whatIfMode)}
                  className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded transition ${whatIfMode ? 'bg-white/10 text-white' : 'bg-transparent text-zinc-500 border border-white/10'}`}
                >
                  {whatIfMode ? 'Hide' : 'Edit'}
                </button>
              </div>
              
              {whatIfMode && (
                <div className="p-4 space-y-5 text-[11px] font-medium bg-black/60 backdrop-blur-md">
                  <div className="space-y-2">
                    <label className="text-zinc-500 uppercase tracking-wider flex justify-between">
                      <span>Profile</span>
                    </label>
                    <select 
                      value={whatIfParams.chemical_type}
                      onChange={(e) => setWhatIfParams(p => ({ ...p, chemical_type: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-zinc-200 outline-none focus:border-white/20 transition appearance-none"
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
          </div>

          {/* Incident Timeline Scrubber */}
          <IncidentTimeline
            currentStage={currentTimelineStage}
            onSelectStage={handleTimelineSelect}
            disabled={loading}
          />
        </div>

        {/* Right Half: Intelligence Panel */}
        <aside className="w-[520px] bg-zinc-950/80 backdrop-blur-3xl flex flex-col overflow-y-auto shrink-0 border-l border-zinc-800/40 z-10 scrollbar-thin">
          {/* Intelligence Panel Header */}
          <div className="px-8 py-6 bg-black/60 border-b border-white/5 sticky top-0 z-10 backdrop-blur-2xl">
            <h2 className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-300 flex items-center space-x-3">
              <Activity className="w-3 h-3 text-zinc-500" />
              <span>Telemetry Analysis</span>
            </h2>
          </div>

          <motion.div 
            key={selectedFacility.key}
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
            }}
            className="p-8 space-y-8"
          >
            {/* Section 1: Tier 1 Triage */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  01 // Primary Scan
                </h3>
                <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
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
                  <span className="text-sm font-semibold text-zinc-200">
                    <AnimatedCounter value={activeScenario?.telemetry.frp || 0} decimals={1} />
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">TAI Z-Score</span>
                  <span className={`text-sm font-semibold ${isExplosion ? 'text-red-400' : 'text-zinc-200'}`}>
                    +<AnimatedCounter value={activeScenario?.triage_result.features.tai || 0} decimals={1} />σ
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">SPF</span>
                  <span className="text-sm font-semibold text-zinc-200">
                    <AnimatedCounter value={activeScenario?.triage_result.features.spf || 0} decimals={2} />
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-center items-center">
                  <span className="text-zinc-500 mb-1 text-[10px] font-medium">Band I4</span>
                  <span className="text-sm font-semibold text-zinc-200">
                    <AnimatedCounter value={activeScenario?.telemetry.bright_ti4 || 0} decimals={1} /> K
                  </span>
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
                  <span className="text-[9px] font-semibold tracking-[0.1em] text-zinc-500 uppercase block mb-3">
                    Model Drivers (SHAP)
                  </span>
                  <div className="grid grid-cols-1 gap-2.5 text-[10px] font-medium">
                    {activeScenario.xai_feature_attributions.map((attr, idx) => (
                      <motion.div 
                        key={idx} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1, duration: 0.4 }}
                        className="flex items-center justify-between"
                      >
                        <span className="text-zinc-400 w-24 truncate tracking-wider uppercase">{attr.feature.replace(/_/g, ' ')}</span>
                        <div className="flex-1 mx-4 bg-white/5 h-0.5 rounded-full overflow-hidden flex relative">
                          {attr.contribution > 0 ? (
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, attr.contribution * 100)}%` }}
                              transition={{ delay: idx * 0.1 + 0.2, duration: 0.6, ease: "easeOut" }}
                              className="bg-red-500 h-full absolute right-1/2" 
                            />
                          ) : (
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, Math.abs(attr.contribution) * 100)}%` }}
                              transition={{ delay: idx * 0.1 + 0.2, duration: 0.6, ease: "easeOut" }}
                              className="bg-emerald-500 h-full absolute left-1/2" 
                            />
                          )}
                          {/* Center line marker */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
                        </div>
                        <span className={`w-10 text-right font-mono tracking-wider ${attr.contribution > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {attr.contribution > 0 ? '+' : ''}{(attr.contribution).toFixed(2)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Section 2: Tier 2 CNN Verification */}
            {currentTimelineStage >= 1 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="space-y-4 pt-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    02 // Multi-Spectral Analysis
                  </h3>
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                    Sentinel-2
                  </span>
                </div>

                {activeScenario?.satellite_imagery || baselineImagery ? (
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
                          Combustion Mask
                        </button>
                      </div>
                    </div>

                    {/* Satellite Image Display */}
                    <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-950 flex items-center justify-center">
                      
                      {/* Interactive Slider for 'After' state */}
                      {activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION" && baselineImagery ? (
                        <BeforeAfterSlider
                          beforeUrl={satelliteViewMode === 'rgb' ? baselineImagery.rgb_preview_url : baselineImagery.swir_preview_url}
                          afterUrl={satelliteViewMode === 'rgb' ? activeScenario?.satellite_imagery?.rgb_preview_url || "" : activeScenario?.satellite_imagery?.swir_preview_url || ""}
                        />
                      ) : (
                        /* Static Image for Baseline / Queued state */
                        <img 
                          src={satelliteViewMode === 'rgb' 
                            ? (baselineImagery || activeScenario?.satellite_imagery)?.rgb_preview_url 
                            : (baselineImagery || activeScenario?.satellite_imagery)?.swir_preview_url
                          }
                          alt="Sentinel-2 Satellite Imagery"
                          className="w-full h-full object-cover opacity-90"
                        />
                      )}

                      {/* Combustion Mask Overlay */}
                      {satelliteViewMode === 'mask' && activeScenario?.cnn_verification && activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION" && (
                        <div className="absolute inset-0 bg-indigo-950/20 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20">
                          <div className="text-center p-4 rounded-xl bg-zinc-950/90 border border-indigo-500/30 text-indigo-200 shadow-xl">
                            <p className="text-xs font-semibold text-indigo-300 mb-1">Combustion Core Isolated</p>
                            <p className="text-[11px] text-zinc-400">
                              {activeScenario.cnn_verification.fire_footprint.active_pixel_count} Active Pixels<br/>
                              ~{activeScenario.cnn_verification.fire_footprint.fire_area_m2.toLocaleString()} m²
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Queued Processing Overlay */}
                      {activeScenario?.scenario === "INCIDENT_SIMULATION_EXPLOSION_QUEUED" && (
                        <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md flex flex-col justify-end z-30">
                          <div className="p-6 space-y-5">
                            <div className="flex flex-col items-center justify-center space-y-5 pt-2">
                              <div className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-30"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]"></span>
                              </div>
                              
                              <div className="h-5 flex items-center justify-center overflow-hidden w-full">
                                <AnimatePresence mode="wait">
                                  <motion.span
                                    key={taskStatus?.step || 'init'}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.4, ease: "easeOut" }}
                                    className="text-[11px] font-medium text-zinc-400 tracking-wider uppercase text-center"
                                  >
                                    {taskStatus?.step || 'Initializing spectral compute nodes...'}
                                  </motion.span>
                                </AnimatePresence>
                              </div>
                            </div>
                            <div className="w-full pb-2">
                              <div className="h-[1px] w-full bg-zinc-800/50 overflow-hidden relative">
                                <motion.div 
                                  className="h-full absolute left-0 top-0 bg-gradient-to-r from-zinc-600 via-zinc-200 to-white"
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${taskStatus?.progress || 0}%` }}
                                  transition={{ ease: "linear", duration: 0.5 }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {activeScenario?.scenario !== "INCIDENT_SIMULATION_EXPLOSION" && (
                        <div className="absolute bottom-2 left-2 bg-zinc-950/80 backdrop-blur-md px-2 py-1 rounded-md text-[9px] font-medium text-zinc-400 border border-zinc-800/50 z-10">
                          {satelliteViewMode === 'rgb' ? 'TCI (True Color RGB)' : 'B12 (SWIR Thermal)'}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                      <div>
                        <span className="block text-[9px] font-medium text-zinc-500 uppercase tracking-widest mb-1">GSD</span>
                        <span className="text-xs font-mono text-zinc-300">{(baselineImagery || activeScenario?.satellite_imagery)?.gsd_meters}m / px</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-medium text-zinc-500 uppercase tracking-widest mb-1">Dimensions</span>
                        <span className="text-xs font-mono text-zinc-300">{(baselineImagery || activeScenario?.satellite_imagery)?.patch_dimensions}</span>
                      </div>
                    </div>

                    {/* CNN Metrics Details */}
                    {activeScenario?.cnn_verification && (
                      <div className="space-y-3 pt-4 text-xs">
                        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-400 font-medium">CNN Classification:</span>
                            <span className={`font-semibold ${activeScenario.cnn_verification.is_verified_fire ? 'text-red-400' : 'text-emerald-400'} uppercase tracking-wide`}>
                              {activeScenario.cnn_verification.prediction_class.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-400 font-medium">CNN Confidence:</span>
                            <span className="font-semibold text-amber-500">
                              <AnimatedCounter value={activeScenario.cnn_verification.confidence * 100} decimals={1} />%
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-400 font-medium">Verified Fire Area:</span>
                            <span className="font-semibold text-zinc-100">
                              <AnimatedCounter value={activeScenario.cnn_verification.fire_footprint.fire_area_m2} format="comma" /> m² 
                              (<AnimatedCounter value={activeScenario.cnn_verification.fire_footprint.fire_area_hectares} decimals={1} /> ha)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-400 font-medium">Action:</span>
                            <span className="font-semibold text-sky-400 uppercase tracking-wide">{activeScenario.cnn_verification.action}</span>
                          </div>
                        </div>
                        {activeScenario.cnn_verification.descriptive_analysis && (
                          <div className="mt-2 p-4 rounded-lg bg-black/60 border border-zinc-800/50 text-[11px] leading-relaxed text-zinc-400 italic">
                            <TypewriterText text={activeScenario.cnn_verification.descriptive_analysis} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-zinc-900/30 border border-zinc-800/60 rounded-2xl">
                    <p className="text-xs text-zinc-500 font-medium">Awaiting High-Resolution Satellite Pass...</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Section 3: Plume & Evacuation SOP */}
            {currentTimelineStage >= 3 && activeScenario?.ndrf_sop_dispatch && (
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="space-y-4 pt-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    03 // Dispersion & Response
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    Gaussian Plume
                  </span>
                </div>
                
                <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-900/30 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      NDRF DISPATCH: {activeScenario.ndrf_sop_dispatch.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-500 font-medium mb-1">Evacuation Radius</p>
                      <p className="text-zinc-200 font-semibold">
                        <AnimatedCounter value={activeScenario.plume_dispersion?.properties?.max_evacuation_radius_km ?? activeScenario.ndrf_sop_dispatch.evacuation_zone_km} decimals={1} /> km
                      </p>
                    </div>
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-500 font-medium mb-1">Population at Risk</p>
                      <p className="text-zinc-200 font-semibold">
                        ~<AnimatedCounter value={activeScenario.population_impact?.total_estimated_exposed ?? activeScenario.ndrf_sop_dispatch.total_population_at_risk} format="comma" />
                      </p>
                    </div>
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-500 font-medium mb-1">Chemical Hazard</p>
                      <p className="text-red-400 font-semibold">{activeScenario.chemical_profile?.primary_hazard ?? activeScenario.ndrf_sop_dispatch.chemical_hazard}</p>
                    </div>
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-500 font-medium mb-1">Confidence</p>
                      <p className="text-zinc-200 font-semibold">
                        <AnimatedCounter value={activeScenario.cnn_verification?.confidence ? activeScenario.cnn_verification.confidence * 100 : activeScenario.ndrf_sop_dispatch.cnn_confidence_pct} decimals={1} />%
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-zinc-400 leading-relaxed pt-2 border-t border-zinc-800/50 mt-3">
                    Jurisdiction: <span className="text-zinc-300 font-medium">{activeScenario.ndrf_sop_dispatch.jurisdiction}</span>
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        </aside>
      </div>

      {/* Sleek Minimalist Footer */}
      <footer className="h-8 border-t border-white/5 bg-black/60 backdrop-blur-md flex items-center justify-between px-8 text-[9px] font-medium tracking-[0.1em] text-zinc-600 uppercase shrink-0">
        <div className="flex space-x-6">
          <span className="flex items-center space-x-2">
            <span className="w-1 h-1 rounded-full bg-emerald-500/50 inline-block"></span>
            <span>System Nominal</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-1 h-1 rounded-full bg-zinc-700 inline-block"></span>
            <span>Latency: 12ms</span>
          </span>
        </div>
        <span>VULCAN GRID // 2026</span>
      </footer>
    </div>
  );
}
