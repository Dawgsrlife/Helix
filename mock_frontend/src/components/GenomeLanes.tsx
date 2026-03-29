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
                  const selected = isActive && selectedPosition === position;
                  return (
                    <button
                      key={`${candidateId}-${position}`}
                      className={`base ${baseClass(base)} ${selected ? "selected" : ""} ${
                        heat ? (heat.deltaLikelihood >= 0 ? "heat-up" : "heat-down") : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectCandidate(candidateId);
                        onSelectPosition(position);
                      }}
                      title={`Position ${position}`}
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
