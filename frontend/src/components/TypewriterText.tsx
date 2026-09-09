import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export const TypewriterText: React.FC<{ text: string }> = ({ text }) => {
  const [length, setLength] = useState(0);

  useEffect(() => {
    setLength(0);
    const interval = setInterval(() => {
      setLength((prev) => {
        if (prev >= text.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 15); // Fast typing speed

    return () => clearInterval(interval);
  }, [text]);

  return (
    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {text.substring(0, length)}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="inline-block w-1.5 h-3 bg-indigo-500 ml-0.5 align-middle"
      />
    </motion.span>
  );
};
