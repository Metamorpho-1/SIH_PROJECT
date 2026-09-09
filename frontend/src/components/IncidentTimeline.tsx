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
      desc: 'NASA VIIRS Overpass: Equilibrium baseline (24.5 MW).',
      icon: CheckCircle,
      color: 'text-emerald-400',
      border: 'border-emerald-500',
      activeBg: 'bg-emerald-950/80',
    },
    {
      step: 1,
      time: 'T + 2m',
      title: '120MW Anomaly',
      desc: 'Thermal anomaly: FRP jumps to 145 MW, Critical Alert.',
      icon: AlertTriangle,
      color: 'text-red-400',
      border: 'border-red-500',
      activeBg: 'bg-red-950/80',
    },
    {
      step: 2,
      time: 'T + 8m',
      title: 'Sentinel-2 Validation',
      desc: 'Spectral validation: 8,400 m² thermal footprint confirmed.',
      icon: Satellite,
      color: 'text-purple-400',
      border: 'border-purple-500',
      activeBg: 'bg-purple-950/80',
    },
    {
      step: 3,
      time: 'T + 15m',
      title: 'Plume & Evacuation',
      desc: 'Gaussian plume coupled with thermal area: 10.5 km exposure corridor dispatched to responders.',
      icon: Wind,
      color: 'text-amber-400',
      border: 'border-amber-500',
      activeBg: 'bg-amber-950/80',
    },
  ];

  return (
    <div className="w-full bg-zinc-900/90 border-t border-zinc-800 px-4 py-2 flex items-center justify-between font-mono text-xs z-10 shrink-0">
      <div className="flex items-center space-x-2 text-zinc-400 shrink-0 mr-4">
        <Clock className="w-4 h-4 text-zinc-500" />
        <span className="font-bold text-zinc-300 uppercase text-[11px]">EVENT LIFECYCLE REPLAY:</span>
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
                    ? 'bg-zinc-950/80 border-zinc-700 text-zinc-300'
                    : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isCurrent ? st.color : 'text-zinc-500'}`} />
              <div className="overflow-hidden">
                <div className="flex items-center space-x-1.5">
                  <span className={`font-bold text-[10px] ${isCurrent ? 'text-white' : 'text-zinc-400'}`}>
                    {st.time}
                  </span>
                  <span className="text-[10px] font-semibold truncate text-zinc-200">{st.title}</span>
                </div>
                <p className="text-[10px] text-zinc-400 truncate mt-0.5">{st.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
