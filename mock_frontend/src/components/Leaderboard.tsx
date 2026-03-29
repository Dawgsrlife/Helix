import { motion } from "framer-motion";

import type { CandidateState } from "../types";

function rankValue(candidate: CandidateState): number {
  if (!candidate.scores) return -Infinity;
  if (typeof candidate.scores.combined === "number") return candidate.scores.combined;
  return candidate.scores.functional;
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(3);
}

export function Leaderboard({
  candidates,
  activeCandidateId,
  onSelect
}: {
  candidates: Record<number, CandidateState>;
  activeCandidateId: number | null;
  onSelect: (candidateId: number) => void;
}) {
  const ordered = Object.values(candidates).sort((a, b) => rankValue(b) - rankValue(a));

  return (
    <div className="leaderboard-grid">
      {ordered.map((candidate, index) => (
        <motion.button
          type="button"
          key={candidate.id}
          className={`board-card ${activeCandidateId === candidate.id ? "active" : ""}`}
          onClick={() => onSelect(candidate.id)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <div className="board-head">
            <strong>#{candidate.id}</strong>
            <span className={`status ${candidate.status}`}>{candidate.status}</span>
          </div>
          <div className="board-score">Combined {fmt(candidate.scores?.combined)}</div>
          <div className="board-metrics">
            <span>Functional {fmt(candidate.scores?.functional)}</span>
            <span>Tissue {fmt(candidate.scores?.tissue_specificity)}</span>
            <span>Safety {fmt(candidate.scores ? 1 - candidate.scores.off_target : null)}</span>
            <span>Novelty {fmt(candidate.scores?.novelty)}</span>
          </div>
          {candidate.error ? <div className="error-line">{candidate.error}</div> : null}
        </motion.button>
      ))}
    </div>
  );
}
