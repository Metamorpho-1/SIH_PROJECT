import React from 'react';
import { Clock, CheckCircle, AlertTriangle, Satellite, Wind } from 'lucide-react';

interface IncidentTimelineProps {
  currentStage: number; // 0: Baseline, 1: Explosion, 2: CNN Verification, 3: Plume & SOP
  onSelectStage: (stage: number) => void;
  disabled?: boolean;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  currentStage,
  onSelectStage,
  disabled,
}) => {
  const stages = [
    {
      step: 0,
      time: 'T - 0m',
      title: 'Routine Flaring',
      desc: 'NASA VIIRS Overpass: Equilibrium baseline (24.5 MW), alarm suppressed in 0.005 ms.',
      icon: CheckCircle,
      color: 'text-emerald-400',
      border: 'border-emerald-500',
      activeBg: 'bg-emerald-950/80',
    },
    {
      step: 1,
      time: 'T + 2m',
      title: '120MW Explosion',
      desc: 'Catastrophic thermal excursion: FRP jumps to 145 MW (TAI = +31.7σ), Class 1 Critical Alert.',
      icon: AlertTriangle,
      color: 'text-red-400',
      border: 'border-red-500',
      activeBg: 'bg-red-950/80',
    },
    {
      step: 2,
      time: 'T + 8m',
      title: 'Sentinel-2 CNN',
      desc: 'High-res SWIR verification: 8,400 m² combustion footprint confirmed, P = 99.5%.',
      icon: Satellite,
      color: 'text-purple-400',
      border: 'border-purple-500',
      activeBg: 'bg-purple-950/80',
    },
    {
      step: 3,
      time: 'T + 15m',
      title: 'Plume & Evacuation',
      desc: 'Gaussian plume coupled with CNN fire area: 10.5 km toxic corridor dispatched to NDRF.',
      icon: Wind,
      color: 'text-amber-400',
      border: 'border-amber-500',
      activeBg: 'bg-amber-950/80',
    },
  ];

  return (
    <div className="w-full bg-slate-900/90 border-t border-slate-800 px-4 py-2 flex items-center justify-between font-mono text-xs z-10 shrink-0">
      <div className="flex items-center space-x-2 text-slate-400 shrink-0 mr-4">
        <Clock className="w-4 h-4 text-cyan-400" />
        <span className="font-bold text-slate-200 uppercase text-[11px]">DISASTER LIFECYCLE REPLAY:</span>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-2">
        {stages.map((st) => {
          const isActive = currentStage >= st.step;
          const isCurrent = currentStage === st.step;
          const Icon = st.icon;

          return (
            <button
              key={st.step}
              disabled={disabled}
              onClick={() => onSelectStage(st.step)}
              className={`p-2 rounded-lg border text-left transition flex items-start space-x-2.5 active:scale-95 ${
                isCurrent
                  ? `${st.activeBg} ${st.border} shadow-lg`
                  : isActive
                    ? 'bg-slate-950/80 border-slate-700 text-slate-300'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-500 hover:text-slate-400'
              }`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isCurrent ? st.color : 'text-slate-500'}`} />
              <div className="overflow-hidden">
                <div className="flex items-center space-x-1.5">
                  <span className={`font-bold text-[10px] ${isCurrent ? 'text-white' : 'text-slate-400'}`}>
                    {st.time}
                  </span>
                  <span className="text-[10px] font-semibold truncate text-slate-200">{st.title}</span>
                </div>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{st.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
