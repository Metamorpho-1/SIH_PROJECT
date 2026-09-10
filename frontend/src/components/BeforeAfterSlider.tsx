import React, { useState, useRef, useEffect } from 'react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({ beforeUrl, afterUrl }) => {
  const [sliderPosition, setSliderPosition] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-reveal animation on mount
  useEffect(() => {
    let anim: NodeJS.Timeout;
    const timer = setTimeout(() => {
      let current = 100;
      anim = setInterval(() => {
        current -= 1.5;
        if (current <= 50) {
          setSliderPosition(50);
          clearInterval(anim);
        } else {
          setSliderPosition(current);
        }
      }, 16);
    }, 400); // Slight delay so the user sees the baseline first
    
    return () => {
      clearTimeout(timer);
      if (anim) clearInterval(anim);
    };
  }, [beforeUrl, afterUrl]);

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
      className="relative w-full h-full overflow-hidden cursor-ew-resize select-none"
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

      {/* High-Tech Slider Line & Handle */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] z-10 transition-transform duration-75"
        style={{ left: `${sliderPosition}%`, transform: `translateX(-50%) ${isDragging ? 'scaleX(1.5)' : 'scaleX(1)'}` }}
      >
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-cyan-400 bg-zinc-950/80 backdrop-blur flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.6)] transition-transform duration-200 ${isDragging ? 'scale-90' : 'scale-100 hover:scale-110'}`}>
          <div className="flex text-cyan-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="-ml-2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {/* Dynamic Badges */}
      <div 
        className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1 rounded text-[9px] font-mono text-zinc-300 pointer-events-none uppercase tracking-widest border border-white/10 transition-opacity duration-300"
        style={{ opacity: sliderPosition > 15 ? 1 : 0 }}
      >
        Baseline
      </div>
      <div 
        className="absolute top-3 right-3 bg-red-950/80 backdrop-blur px-2.5 py-1 rounded text-[9px] font-mono text-red-200 pointer-events-none uppercase tracking-widest border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-opacity duration-300"
        style={{ opacity: sliderPosition < 85 ? 1 : 0 }}
      >
        Anomaly
      </div>
    </div>
  );
};
