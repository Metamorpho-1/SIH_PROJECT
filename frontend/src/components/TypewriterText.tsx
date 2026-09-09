import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export const TypewriterText: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(i));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 15); // Fast typing speed

    return () => clearInterval(interval);
  }, [text]);

  return (
    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {displayedText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="inline-block w-1.5 h-3 bg-indigo-500 ml-0.5 align-middle"
      />
    </motion.span>
  );
};
