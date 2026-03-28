"use client";

import { motion } from "framer-motion";
import type { LikelihoodScore } from "@/types";

interface LikelihoodGraphProps {
  scores: LikelihoodScore[];
  highlightedPosition?: number;
  onPositionHover: (position: number) => void;
}

export default function LikelihoodGraph({
  scores,
  highlightedPosition,
  onPositionHover,
}: LikelihoodGraphProps) {
  if (scores.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        No likelihood scores available
      </div>
    );
  }

  const maxScore = Math.max(...scores.map((s) => Math.abs(s.score)));
  const normalizedMax = maxScore || 1;

  // Downsample for performance if needed
  const maxBars = 500;
  const step = Math.max(1, Math.floor(scores.length / maxBars));
  const displayScores =
    step > 1
      ? scores.filter((_, i) => i % step === 0)
      : scores;

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          Evo 2 Log-Likelihood
        </span>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {scores.length} positions
        </span>
      </div>

      <div className="flex-1 flex items-end gap-px overflow-hidden">
        {displayScores.map((score, i) => {
          const height = (Math.abs(score.score) / normalizedMax) * 100;
          const isHighlighted = score.position === highlightedPosition;
          const isPositive = score.score >= 0;

          return (
            <motion.div
              key={score.position}
              className="flex-1 min-w-[1px] cursor-pointer relative group"
              style={{ height: "100%" }}
              onMouseEnter={() => onPositionHover(score.position)}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.001, duration: 0.3 }}
            >
              <div
                className="absolute bottom-0 left-0 right-0 transition-colors rounded-t-sm"
                style={{
                  height: `${Math.max(height, 2)}%`,
                  backgroundColor: isHighlighted
                    ? "var(--accent-cyan)"
                    : isPositive
                      ? "var(--accent-emerald)"
                      : "var(--accent-rose)",
                  opacity: isHighlighted ? 1 : 0.7,
                }}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
