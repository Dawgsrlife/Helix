"use client";

import { motion } from "framer-motion";

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({
  message = "Analyzing sequence...",
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="flex gap-1">
        {["A", "T", "C", "G"].map((base, i) => (
          <motion.span
            key={base}
            className="text-2xl font-bold font-mono"
            style={{
              color:
                base === "A"
                  ? "var(--base-a)"
                  : base === "T"
                    ? "var(--base-t)"
                    : base === "C"
                      ? "var(--base-c)"
                      : "var(--base-g)",
            }}
            animate={{
              y: [0, -12, 0],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          >
            {base}
          </motion.span>
        ))}
      </div>
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
