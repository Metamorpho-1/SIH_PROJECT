import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export const AnimatedCounter: React.FC<{
  value: number;
  decimals?: number;
  duration?: number;
}> = ({ value, decimals = 0, duration = 1.5 }) => {
  const [hasMounted, setHasMounted] = useState(false);
  const spring = useSpring(0, { bounce: 0, duration: duration * 1000 });
  const display = useTransform(spring, (current: number) => current.toFixed(decimals));

  useEffect(() => {
    setHasMounted(true);
    spring.set(value);
  }, [value, spring]);

  if (!hasMounted) return <span>{value.toFixed(decimals)}</span>;

  return <motion.span>{display}</motion.span>;
};
