"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MutationEffect, Nucleotide } from "@/types";

interface MutationPanelProps {
  sequence: string;
  onMutationSubmit: (position: number, alternate: string) => void;
  mutationEffect?: MutationEffect;
  isLoading: boolean;
}

const BASES: Nucleotide[] = ["A", "T", "C", "G"];

const BASE_COLORS: Record<Nucleotide, string> = {
  A: "#6bbd7a",
  T: "#d47a7a",
  C: "#6b9fd4",
  G: "#c9a855",
  N: "#6b6b6b",
};

const IMPACT_STYLES: Record<
  MutationEffect["predictedImpact"],
  { color: string; label: string }
> = {
  benign: { color: "#6bbd7a", label: "Benign" },
  moderate: { color: "#c9a855", label: "Moderate" },
  deleterious: { color: "#d47a7a", label: "Deleterious" },
};

export default function MutationPanel({
  sequence,
  onMutationSubmit,
  mutationEffect,
  isLoading,
}: MutationPanelProps) {
  const [position, setPosition] = useState("");
  const [alternate, setAlternate] = useState<Nucleotide | null>(null);

  const posNum = parseInt(position, 10);
  const isValidPosition =
    !isNaN(posNum) && posNum >= 0 && posNum < sequence.length;
  const currentBase = isValidPosition
    ? (sequence[posNum] as Nucleotide)
    : null;
  const canSubmit = isValidPosition && alternate !== null && !isLoading;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !alternate) return;
    onMutationSubmit(posNum, alternate);
  }, [canSubmit, alternate, posNum, onMutationSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && canSubmit) handleSubmit();
    },
    [canSubmit, handleSubmit]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
          Mutation
        </span>
        {currentBase && (
          <span className="text-[11px] font-mono text-[#4a4a4a]">
            Wildtype:{" "}
            <span style={{ color: BASE_COLORS[currentBase] }}>
              {currentBase}
            </span>
          </span>
        )}
      </div>

      {/* Position input */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4a4a4a] mb-1.5">
          Position
        </label>
        <input
          type="number"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
          min={0}
          max={sequence.length - 1}
          className="w-full h-9 px-3 rounded-lg bg-[#1b1b1d] text-[#e5e1e4] text-sm font-mono placeholder:text-[#3a3a3c] outline-none transition-colors focus:bg-[#222224]"
        />
      </div>

      {/* Base selector */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4a4a4a] mb-1.5">
          Target base
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BASES.map((base) => {
            const isCurrentBase = base === currentBase;
            const isSelected = alternate === base;
            const color = BASE_COLORS[base];
            return (
              <motion.button
                key={base}
                onClick={() => !isCurrentBase && setAlternate(base)}
                disabled={isCurrentBase}
                whileTap={!isCurrentBase ? { scale: 0.95 } : undefined}
                className={`
                  h-10 rounded-lg font-mono text-sm font-semibold transition-all duration-150
                  ${isCurrentBase ? "bg-[#131315] cursor-not-allowed opacity-25" : ""}
                  ${isSelected && !isCurrentBase ? "bg-[#2a2a2c]" : ""}
                  ${!isSelected && !isCurrentBase ? "bg-[#1b1b1d] hover:bg-[#222224]" : ""}
                `}
                style={{
                  color: isCurrentBase
                    ? "#2a2a2c"
                    : isSelected
                      ? color
                      : "#6b6b6b",
                  boxShadow: isSelected && !isCurrentBase
                    ? `inset 0 0 0 1px ${color}`
                    : undefined,
                }}
              >
                {base}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Run button */}
      <motion.button
        onClick={handleSubmit}
        disabled={!canSubmit}
        whileTap={canSubmit ? { scale: 0.98 } : undefined}
        className={`
          h-10 rounded-lg text-sm font-medium transition-all duration-200
          ${
            canSubmit
              ? "bg-[#e5e1e4] text-[#0c0c0e] hover:bg-[#d0ccc8]"
              : "bg-[#1b1b1d] text-[#3a3a3c] cursor-not-allowed"
          }
        `}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              className="block w-3 h-3 rounded-full border-2 border-[#0c0c0e] border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            Running
          </span>
        ) : (
          "Run simulation"
        )}
      </motion.button>

      {/* Result */}
      <AnimatePresence mode="wait">
        {mutationEffect && (
          <motion.div
            key={`${mutationEffect.position}-${mutationEffect.alternateBase}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="rounded-lg bg-[#1b1b1d] p-4"
          >
            {/* Delta score */}
            <div className="flex items-baseline justify-between mb-3">
              <span
                className="text-3xl font-semibold font-mono tracking-tight"
                style={{
                  color: IMPACT_STYLES[mutationEffect.predictedImpact].color,
                }}
              >
                {mutationEffect.deltaLikelihood > 0 ? "+" : ""}
                {mutationEffect.deltaLikelihood.toFixed(2)}
              </span>
              <span className="text-[11px] font-mono text-[#4a4a4a]">
                delta log-likelihood
              </span>
            </div>

            {/* Impact */}
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    IMPACT_STYLES[mutationEffect.predictedImpact].color,
                }}
              />
              <span
                className="text-xs font-medium"
                style={{
                  color: IMPACT_STYLES[mutationEffect.predictedImpact].color,
                }}
              >
                {IMPACT_STYLES[mutationEffect.predictedImpact].label}
              </span>
              <span className="text-[11px] text-[#4a4a4a] font-mono ml-auto">
                {mutationEffect.referenceBase} &rarr;{" "}
                {mutationEffect.alternateBase} at {mutationEffect.position}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
