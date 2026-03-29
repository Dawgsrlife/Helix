import { motion } from "framer-motion";

import type { CandidateState } from "../types";

function baseClass(base: string): string {
  switch (base.toUpperCase()) {
    case "A":
      return "base-a";
    case "T":
      return "base-t";
    case "C":
      return "base-c";
    case "G":
      return "base-g";
    default:
      return "base-n";
  }
}

function heatFromScore(score: number | undefined): number {
  if (score === undefined || Number.isNaN(score)) return 0;
  const normalized = 1 / (1 + Math.exp(-4 * (score + 0.35)));
  return Math.max(0, Math.min(1, normalized));
}

export function GenomeLanes({
  candidateOrder,
  candidates,
  activeCandidateId,
  selectedPosition,
  onSelectCandidate,
  onSelectPosition
}: {
  candidateOrder: number[];
  candidates: Record<number, CandidateState>;
  activeCandidateId: number | null;
  selectedPosition: number | null;
  onSelectCandidate: (candidateId: number) => void;
  onSelectPosition: (position: number | null) => void;
}) {
  return (
    <div className="genome-lanes">
      {candidateOrder.map((candidateId, index) => {
        const candidate = candidates[candidateId];
        const sequence = candidate?.sequence ?? "";
        const isActive = activeCandidateId === candidateId;
        return (
          <motion.div
            key={candidateId}
            className={`lane ${isActive ? "active" : ""}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onSelectCandidate(candidateId)}
          >
            <div className="lane-head">
              <strong>Candidate #{candidateId}</strong>
              <span className={`status ${candidate?.status ?? "queued"}`}>{candidate?.status ?? "queued"}</span>
              <span className="length">{sequence.length} bp</span>
            </div>
            <div className="lane-seq" role="list">
              {sequence.length === 0 ? (
                <div className="lane-placeholder">Streaming bases...</div>
              ) : (
                sequence.slice(0, 200).split("").map((base, position) => {
                  const heat = candidate?.baseHeat[position];
                  const likelihood = candidate?.perPositionScores[position];
                  const likelihoodHeat = heatFromScore(likelihood);
                  const selected = isActive && selectedPosition === position;
                  return (
                    <button
                      key={`${candidateId}-${position}`}
                      className={`base ${baseClass(base)} ${selected ? "selected" : ""} ${
                        heat ? (heat.deltaLikelihood >= 0 ? "heat-up" : "heat-down") : ""
                      }`}
                      style={
                        likelihoodHeat > 0
                          ? {
                              background: `linear-gradient(180deg, rgba(9, 212, 156, ${0.08 + likelihoodHeat * 0.38}), rgba(4, 11, 20, 0.45))`
                            }
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectCandidate(candidateId);
                        onSelectPosition(position);
                      }}
                      title={`Position ${position}${likelihood !== undefined ? ` | Evo2 score ${likelihood.toFixed(3)}` : ""}`}
                    >
                      {base}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
