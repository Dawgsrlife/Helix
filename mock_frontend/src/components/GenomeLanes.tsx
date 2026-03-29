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

function formatBp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M bp`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K bp`;
  return `${n.toLocaleString()} bp`;
}

/** Simulated genomic coordinate context based on candidate id */
function genomeContext(candidateId: number, seqLen: number): { chr: string; start: number; end: number; gene: string } {
  const genes = [
    { chr: "chr11", start: 27_679_500, gene: "BDNF" },
    { chr: "chr17", start: 7_571_720, gene: "TP53" },
    { chr: "chr7", start: 117_119_500, gene: "CFTR" },
    { chr: "chr4", start: 3_074_680, gene: "HTT" },
    { chr: "chr13", start: 32_889_610, gene: "BRCA2" },
    { chr: "chr17", start: 43_044_295, gene: "BRCA1" },
    { chr: "chr1", start: 11_845_780, gene: "MTHFR" },
    { chr: "chr6", start: 26_087_280, gene: "HLA-A" },
    { chr: "chr19", start: 44_905_790, gene: "APOE" },
    { chr: "chr12", start: 6_061_700, gene: "VWF" },
  ];
  const g = genes[candidateId % genes.length];
  // Scale the context window to represent the Evo2 context range
  const contextWindow = Math.max(seqLen, 131_072); // Evo2 minimum context
  return { chr: g.chr, start: g.start, end: g.start + contextWindow, gene: g.gene };
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
  // Show how much of the total Evo2 context we're viewing
  const activeCandidate = activeCandidateId !== null ? candidates[activeCandidateId] : null;
  const activeLen = activeCandidate?.sequence.length ?? 0;
  const evo2Context = 1_048_576; // 1M token context
  const zoomPct = activeLen > 0 ? ((220 / Math.max(activeLen, 220)) * 100).toFixed(1) : "0";

  return (
    <div className="genome-lanes">
      {activeCandidate && activeLen > 0 && (
        <div className="genome-context">
          <span>
            {(() => {
              const ctx = genomeContext(activeCandidate.id, activeLen);
              return (
                <>
                  <span className="coord">{ctx.chr}:{ctx.start.toLocaleString()}-{ctx.end.toLocaleString()}</span>
                  {" "}({ctx.gene} locus)
                </>
              );
            })()}
          </span>
          <span className="scale-badge">
            Evo2 context: {formatBp(evo2Context)}
          </span>
          <span className="genome-zoom">viewing {zoomPct}%</span>
        </div>
      )}
      {candidateOrder.map((candidateId, index) => {
        const candidate = candidates[candidateId];
        const sequence = candidate?.sequence ?? "";
        const shownSequence = sequence.slice(0, 220);
        const isActive = activeCandidateId === candidateId;
        const ctx = genomeContext(candidateId, sequence.length);
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
              <span className="scale-badge">{formatBp(sequence.length)}</span>
              <span className="length" style={{ fontSize: 10, opacity: 0.7 }}>{ctx.gene}</span>
            </div>
            <div className="lane-heatmap" aria-label="Per-base confidence heatmap">
              {shownSequence.length === 0 ? (
                <div className="lane-placeholder">Heatmap pending...</div>
              ) : (
                shownSequence.split("").map((_base, position) => {
                  const heat = candidate?.baseHeat[position];
                  const likelihood = candidate?.perPositionScores[position];
                  const likelihoodHeat = heatFromScore(likelihood);
                  const mutationBoost = heat ? Math.min(1, Math.abs(heat.deltaLikelihood) * 25) : 0;
                  const value = Math.max(likelihoodHeat, mutationBoost);
                  const selected = isActive && selectedPosition === position;
                  const color = heat
                    ? heat.deltaLikelihood >= 0
                      ? `rgba(9, 212, 156, ${0.25 + value * 0.65})`
                      : `rgba(255, 90, 111, ${0.25 + value * 0.65})`
                    : `rgba(9, 212, 156, ${0.12 + value * 0.6})`;
                  return (
                    <span
                      key={`heat-${candidateId}-${position}`}
                      className={`heat-cell ${selected ? "selected" : ""}`}
                      style={{ backgroundColor: color }}
                      title={`Position ${position}${likelihood !== undefined ? ` | score ${likelihood.toFixed(3)}` : ""}`}
                    />
                  );
                })
              )}
            </div>
            <div className="heat-legend">
              <span>Low confidence</span>
              <span className="heat-legend-bar" />
              <span>High confidence</span>
            </div>
            <div className="lane-seq" role="list">
              {shownSequence.length === 0 ? (
                <div className="lane-placeholder">Streaming bases...</div>
              ) : (
                shownSequence.split("").map((base, position) => {
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
            {sequence.length > 220 && (
              <div className="lane-scale">
                <span>Showing 220 of <span className="full-length">{formatBp(sequence.length)}</span></span>
                <span>Evo2 context: {formatBp(Math.max(sequence.length, 131_072))}</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
