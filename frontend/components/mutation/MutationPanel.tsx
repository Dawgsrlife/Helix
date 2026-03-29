"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MutationEffect, Nucleotide } from "@/types";
import { useHelixStore } from "@/lib/store";

interface MutationPanelProps {
  sequence: string;
  onMutationSubmit: (position: number, alternate: string) => void;
  mutationEffect?: MutationEffect;
  isLoading: boolean;
}

const BASES: Nucleotide[] = ["A", "T", "C", "G"];

const BASE_COLORS: Record<Nucleotide, string> = {
  A: "var(--base-a)",
  T: "var(--base-t)",
  C: "var(--base-c)",
  G: "var(--base-g)",
  N: "var(--base-n)",
};

const IMPACT_STYLES: Record<
  MutationEffect["predictedImpact"],
  { color: string; label: string }
> = {
  benign: { color: "var(--impact-benign)", label: "Benign" },
  moderate: { color: "var(--impact-moderate)", label: "Moderate" },
  deleterious: { color: "var(--impact-deleterious)", label: "Deleterious" },
};

export default function MutationPanel({
  sequence,
  onMutationSubmit,
  mutationEffect,
  isLoading,
}: MutationPanelProps) {
  const [position, setPosition] = useState("");
  const [alternate, setAlternate] = useState<Nucleotide | null>(null);
  const selectedPosition = useHelixStore((s) => s.selectedPosition);

  // Auto-fill position when user clicks a base in the sequence
  useEffect(() => {
    if (selectedPosition !== null) {
      setPosition(String(selectedPosition));
      setAlternate(null);
    }
  }, [selectedPosition]);

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
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Mutation
        </span>
        {currentBase && (
          <span className="text-[11px] font-mono text-[var(--text-faint)]">
            Wildtype:{" "}
            <span style={{ color: BASE_COLORS[currentBase] }}>
              {currentBase}
            </span>
          </span>
        )}
      </div>

      {/* Position input */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1.5">
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
          className="w-full h-9 px-3 rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm font-mono placeholder:text-[var(--text-faint)] outline-none transition-colors focus:bg-[var(--surface-elevated)]"
        />
      </div>

      {/* Base selector */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1.5">
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
                  ${isCurrentBase ? "bg-[var(--surface-base)] cursor-not-allowed opacity-25" : ""}
                  ${isSelected && !isCurrentBase ? "bg-[var(--surface-overlay)]" : ""}
                  ${!isSelected && !isCurrentBase ? "bg-[var(--surface-raised)] hover:bg-[var(--surface-elevated)]" : ""}
                `}
                style={{
                  color: isCurrentBase
                    ? "var(--surface-overlay)"
                    : isSelected
                      ? color
                      : "var(--text-muted)",
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
              ? "bg-[var(--text-primary)] text-[var(--surface-void)] hover:bg-[var(--text-secondary)]"
              : "bg-[var(--surface-raised)] text-[var(--text-faint)] cursor-not-allowed"
          }
        `}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              className="block w-3 h-3 rounded-full border-2 border-[var(--surface-void)] border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            Mutating & re-folding...
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
            className="rounded-lg bg-[var(--surface-raised)] p-4"
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
              <span className="text-[11px] font-mono text-[var(--text-faint)]">
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
              <span className="text-[11px] text-[var(--text-faint)] font-mono ml-auto">
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
