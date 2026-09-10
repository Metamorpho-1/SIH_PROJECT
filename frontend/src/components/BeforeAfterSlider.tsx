import React, { useState, useRef, useEffect, } from 'react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({ beforeUrl, afterUrl }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current || !isDragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;
    setSliderPosition(percentage);
  };

  const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
  const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);

  const stopDragging = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', stopDragging);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', stopDragging);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stopDragging);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-square max-w-sm mx-auto overflow-hidden rounded-xl border border-zinc-800/80 cursor-ew-resize select-none"
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      {/* After Image (Background) */}
      <img 
        src={afterUrl} 
        alt="After incident" 
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      
      {/* Before Image (Foreground, clipped) */}
      <img 
        src={beforeUrl} 
        alt="Before incident baseline" 
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
        draggable={false}
      />

      {/* Slider Line & Handle */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-3 bg-zinc-400 rounded-full" />
            <div className="w-0.5 h-3 bg-zinc-400 rounded-full" />
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-zinc-300 pointer-events-none uppercase tracking-widest border border-white/10">
        Baseline
      </div>
      <div className="absolute top-3 right-3 bg-red-900/60 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-red-200 pointer-events-none uppercase tracking-widest border border-red-500/30">
        Anomaly
      </div>
    </div>
  );
};
