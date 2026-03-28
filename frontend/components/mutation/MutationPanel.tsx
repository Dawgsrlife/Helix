"use client";

import { useState } from "react";
import type { MutationEffect, Nucleotide } from "@/types";
import { IMPACT_COLORS } from "@/lib/colorMap";

interface MutationPanelProps {
  sequence: string;
  onMutationSubmit: (position: number, alternate: string) => void;
  mutationEffect?: MutationEffect;
  isLoading: boolean;
}

const BASES: Nucleotide[] = ["A", "T", "C", "G"];

export default function MutationPanel({
  sequence,
  onMutationSubmit,
  mutationEffect,
  isLoading,
}: MutationPanelProps) {
  const [position, setPosition] = useState("");
  const [alternate, setAlternate] = useState<Nucleotide>("A");

  const posNum = parseInt(position, 10);
  const isValidPosition = !isNaN(posNum) && posNum >= 0 && posNum < sequence.length;
  const currentBase = isValidPosition ? sequence[posNum] : null;

  const handleSubmit = () => {
    if (!isValidPosition) return;
    onMutationSubmit(posNum, alternate);
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
        Mutation Simulator
      </h3>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] block mb-1">
            Position
          </label>
          <input
            type="number"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="0"
            min={0}
            max={sequence.length - 1}
            className="w-full px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent-cyan)]"
          />
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">
            {currentBase ? `${currentBase} →` : "Alt"}
          </label>
          <div className="flex gap-1">
            {BASES.filter((b) => b !== currentBase).map((base) => (
              <button
                key={base}
                onClick={() => setAlternate(base)}
                className={`w-8 h-8 rounded text-sm font-mono font-bold transition-colors ${
                  alternate === base
                    ? "bg-[var(--accent-cyan)] text-white"
                    : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)]"
                }`}
              >
                {base}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isValidPosition || isLoading}
          className="px-4 py-1.5 rounded bg-[var(--accent-violet)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed h-8"
        >
          {isLoading ? "..." : "Predict"}
        </button>
      </div>

      {/* Result */}
      {mutationEffect && (
        <div className="mt-3 p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">
              {mutationEffect.referenceBase} → {mutationEffect.alternateBase} at pos{" "}
              {mutationEffect.position}
            </span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{
                color: IMPACT_COLORS[mutationEffect.predictedImpact],
                backgroundColor: `color-mix(in srgb, ${IMPACT_COLORS[mutationEffect.predictedImpact]} 15%, transparent)`,
              }}
            >
              {mutationEffect.predictedImpact.toUpperCase()}
            </span>
          </div>
          <div className="mt-1 text-sm font-mono text-[var(--text-primary)]">
            ΔLL: {mutationEffect.deltaLikelihood.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
