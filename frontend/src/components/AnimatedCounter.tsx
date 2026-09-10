import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export const AnimatedCounter: React.FC<{
  value: number;
  decimals?: number;
  duration?: number;
  format?: 'standard' | 'comma';
}> = ({ value, decimals = 0, duration = 1.5, format = 'standard' }) => {
  const [hasMounted, setHasMounted] = useState(false);
  const spring = useSpring(0, { bounce: 0, duration: duration * 1000 });
  const display = useTransform(spring, (current: number) => {
    const fixed = current.toFixed(decimals);
    if (format === 'comma') {
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join('.');
    }
    return fixed;
  });

  useEffect(() => {
    setHasMounted(true);
    spring.set(value);
  }, [value, spring]);

  if (!hasMounted) {
    if (format === 'comma') {
      const parts = value.toFixed(decimals).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return <span>{parts.join('.')}</span>;
    }
    return <span>{value.toFixed(decimals)}</span>;
  }

  return <motion.span>{display}</motion.span>;
};
