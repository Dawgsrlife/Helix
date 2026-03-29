"use client";

import { motion } from "framer-motion";

interface LoadingStateProps {
  message?: string;
}

const BASES = [
  { letter: "A", color: "var(--base-a)" },
  { letter: "T", color: "var(--base-t)" },
  { letter: "C", color: "var(--base-c)" },
  { letter: "G", color: "var(--base-g)" },
];

export default function LoadingState({
  message = "Analyzing sequence",
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="flex gap-1.5">
        {BASES.map(({ letter, color }, i) => (
          <motion.span
            key={letter}
            className="text-lg font-semibold font-mono"
            style={{ color }}
            animate={{
              y: [0, -8, 0],
              opacity: [0.3, 0.9, 0.3],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.12,
              ease: "easeInOut",
            }}
          >
            {letter}
          </motion.span>
        ))}
      </div>
      <p className="text-xs text-[var(--text-faint)]">{message}</p>
    </div>
  );
}
