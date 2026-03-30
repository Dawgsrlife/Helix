"use client";

import { useHelixStore } from "@/lib/store";
import { ChevronRight, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { ScienceTooltip } from "@/components/ui/ScienceTooltip";

function strengthLabel(value: number): "Strong" | "Promising" | "Weak" {
  if (value >= 0.75) return "Strong";
  if (value >= 0.55) return "Promising";
  return "Weak";
}

function safetyLabel(offTarget: number): "Strong" | "Moderate" | "Risky" {
  if (offTarget <= 0.03) return "Strong";
  if (offTarget <= 0.08) return "Moderate";
  return "Risky";
}

export default function CandidateLeaderboard() {
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const setActiveCandidateId = useHelixStore((s) => s.setActiveCandidateId);
  const setViewMode = useHelixStore((s) => s.setViewMode);
  const setChatOpen = useHelixStore((s) => s.setChatOpen);
  const setChatDraft = useHelixStore((s) => s.setChatDraft);

  const topCandidate = candidates[0];
  const laySummary = topCandidate
    ? `Top candidate #${topCandidate.id}: likely-to-work ${strengthLabel(topCandidate.scores.functional)}, tissue-fit ${strengthLabel(topCandidate.scores.tissue)}, safety ${safetyLabel(topCandidate.scores.offTarget)}.`
    : "No candidates have completed scoring yet.";
  const expertSummary = topCandidate
    ? `Functional ${topCandidate.scores.functional.toFixed(3)}, tissue specificity ${topCandidate.scores.tissue.toFixed(3)}, off-target ${topCandidate.scores.offTarget.toFixed(3)}, novelty ${topCandidate.scores.novelty.toFixed(3)}.`
    : "";

  const queuePrompt = (prompt: string) => {
    setChatOpen(true);
    setChatDraft(prompt);
  };

  return (
    <div className="flex-1 overflow-auto px-8 py-6" style={{ background: "var(--surface-base)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Ranking</h2>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{candidates.length} candidates scored and ranked by <ScienceTooltip term="overall-viability">composite viability</ScienceTooltip></p>
          </div>
          <button onClick={() => setViewMode("explorer")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
            Inspect top candidate <ArrowRight size={14} />
          </button>
        </div>

        <div className="mb-5 rounded-xl p-4" style={{ background: "var(--surface-elevated)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
            Plain-Language Translation
          </div>
          <p className="text-[13px] leading-relaxed mb-1" style={{ color: "var(--text-primary)" }}>
            {laySummary}
          </p>
          {expertSummary && (
            <p className="text-[12px] font-mono mb-3" style={{ color: "var(--text-muted)" }}>
              {expertSummary}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => queuePrompt("Explain the top candidate for a clinician and a layman in 5 bullet points.")}
              className="px-3 py-1.5 rounded-md text-[11px] transition-colors hover:bg-white/[0.06]"
              style={{ background: "var(--surface-base)", color: "var(--text-secondary)" }}
            >
              Explain Top Candidate
            </button>
            <button
              onClick={() => queuePrompt("Compare top 3 candidates and recommend one for safety-sensitive use.")}
              className="px-3 py-1.5 rounded-md text-[11px] transition-colors hover:bg-white/[0.06]"
              style={{ background: "var(--surface-base)", color: "var(--text-secondary)" }}
            >
              Compare Top 3
            </button>
            <button
              onClick={() => queuePrompt("Improve the active candidate for tissue specificity and explain tradeoffs.")}
              className="px-3 py-1.5 rounded-md text-[11px] transition-colors hover:bg-white/[0.06]"
              style={{ background: "var(--surface-base)", color: "var(--text-secondary)" }}
            >
              Improve Tissue Fit
            </button>
          </div>
        </div>

        {/* Ranking table */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-elevated)" }}>
          <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}>
            <span className="w-10">Rank</span>
            <span className="flex-1">Candidate</span>
            <span className="w-20 text-right"><ScienceTooltip term="functional-plausibility">Functional</ScienceTooltip></span>
            <span className="w-20 text-right"><ScienceTooltip term="tissue-specificity">Tissue</ScienceTooltip></span>
            <span className="w-20 text-right"><ScienceTooltip term="off-target-risk">Off-target</ScienceTooltip></span>
            <span className="w-20 text-right"><ScienceTooltip term="novelty">Novelty</ScienceTooltip></span>
            <span className="w-20 text-right"><ScienceTooltip term="overall-viability">Overall</ScienceTooltip></span>
            <span className="w-8" />
          </div>
          {candidates.map((c, i) => (
            <motion.button key={c.id}
              onClick={() => { setActiveCandidateId(c.id); setViewMode("explorer"); }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06, type: "spring" as const, stiffness: 300, damping: 26 }}
              whileHover={{ scale: 1.005, x: 2 }}
              className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
              style={{
                borderBottom: i < candidates.length - 1 ? "1px solid var(--ghost-border)" : "none",
                borderLeft: activeCandidateId === c.id ? "2px solid var(--accent)" : "2px solid transparent",
              }}>
              <span className="text-base font-semibold w-10 font-mono" style={{ color: i === 0 ? "var(--accent)" : "var(--text-muted)" }}>
                #{i + 1}
              </span>
              <span className="flex-1">
                <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Candidate_{c.id.toString().padStart(3, "0")}</span>
                <span className="text-[11px] font-mono ml-2" style={{ color: "var(--text-faint)" }}>{c.sequence.length} bp</span>
                {c.status !== "scored" && (
                  <span className="text-[10px] font-mono ml-2" style={{ color: c.status === "failed" ? "var(--base-t)" : "var(--text-faint)" }}>
                    {c.status}
                  </span>
                )}
              </span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--accent)" }}>{(c.scores.functional * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--base-c)" }}>{(c.scores.tissue * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: c.scores.offTarget > 0.03 ? "var(--base-t)" : "var(--accent)" }}>{(c.scores.offTarget * 100).toFixed(1)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--base-g)" }}>{(c.scores.novelty * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-base font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{c.overall.toFixed(1)}</span>
              <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "var(--text-faint)" }} />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
