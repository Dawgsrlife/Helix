"use client";

import { motion } from "framer-motion";
import type { MutationEffect } from "@/types";
import { IMPACT_COLORS } from "@/lib/colorMap";

interface MutationDiffProps {
  effect: MutationEffect;
}

export default function MutationDiff({ effect }: MutationDiffProps) {
  const barWidth = Math.min(Math.abs(effect.deltaLikelihood) * 100, 100);
  const isNegative = effect.deltaLikelihood < 0;

  return (
    <motion.div
      className="mt-3"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.2 }}
    >
      <div className="text-xs text-[var(--text-muted)] mb-1">
        Likelihood Delta
      </div>
      <div className="h-4 bg-[var(--bg-primary)] rounded overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--border-subtle)]" />
        <motion.div
          className="absolute top-0 bottom-0 rounded"
          style={{
            backgroundColor: IMPACT_COLORS[effect.predictedImpact],
            left: isNegative ? `${50 - barWidth / 2}%` : "50%",
            width: `${barWidth / 2}%`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${barWidth / 2}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
