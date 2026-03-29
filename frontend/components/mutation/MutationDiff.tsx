"use client";

import { motion } from "framer-motion";
import type { MutationEffect } from "@/types";

interface MutationDiffProps {
  effect: MutationEffect;
}

const IMPACT_COLORS: Record<MutationEffect["predictedImpact"], string> = {
  benign: "var(--impact-benign)",
  moderate: "var(--impact-moderate)",
  deleterious: "var(--impact-deleterious)",
};

export default function MutationDiff({ effect }: MutationDiffProps) {
  const maxDelta = 10;
  const normalized = Math.min(Math.abs(effect.deltaLikelihood) / maxDelta, 1);
  const barPercent = normalized * 50; // max 50% of total width (one side from center)
  const isNegative = effect.deltaLikelihood < 0;
  const color = IMPACT_COLORS[effect.predictedImpact];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
          Likelihood delta
        </span>
        <span className="text-[11px] font-mono text-[var(--text-faint)]">
          {effect.deltaLikelihood > 0 ? "+" : ""}
          {effect.deltaLikelihood.toFixed(2)}
        </span>
      </div>

      {/* Bar visualization */}
      <div className="h-2 bg-[var(--surface-base)] rounded-full overflow-hidden relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--surface-overlay)]" />

        {/* Delta bar */}
        <motion.div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            backgroundColor: color,
            opacity: 0.8,
          }}
          initial={{
            left: "50%",
            width: "0%",
          }}
          animate={{
            left: isNegative ? `${50 - barPercent}%` : "50%",
            width: `${barPercent}%`,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
            delay: 0.1,
          }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[var(--text-faint)] font-mono">-{maxDelta}</span>
        <span className="text-[10px] text-[var(--text-faint)] font-mono">0</span>
        <span className="text-[10px] text-[var(--text-faint)] font-mono">+{maxDelta}</span>
      </div>
    </motion.div>
  );
}
