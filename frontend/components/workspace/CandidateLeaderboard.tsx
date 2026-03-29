"use client";

import { useHelixStore } from "@/lib/store";
import { ChevronRight, ArrowRight } from "lucide-react";

export default function CandidateLeaderboard() {
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const setActiveCandidateId = useHelixStore((s) => s.setActiveCandidateId);
  const setViewMode = useHelixStore((s) => s.setViewMode);

  return (
    <div className="flex-1 overflow-auto px-8 py-6" style={{ background: "var(--surface-base)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Ranking</h2>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{candidates.length} candidates scored and ranked by composite viability</p>
          </div>
          <button onClick={() => setViewMode("explorer")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
            Inspect top candidate <ArrowRight size={14} />
          </button>
        </div>

        {/* Ranking table */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-elevated)" }}>
          <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}>
            <span className="w-10">Rank</span>
            <span className="flex-1">Candidate</span>
            <span className="w-20 text-right">Functional</span>
            <span className="w-20 text-right">Tissue</span>
            <span className="w-20 text-right">Off-target</span>
            <span className="w-20 text-right">Novelty</span>
            <span className="w-20 text-right">Overall</span>
            <span className="w-8" />
          </div>
          {candidates.map((c, i) => (
            <button key={c.id}
              onClick={() => { setActiveCandidateId(c.id); setViewMode("explorer"); }}
              className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
              style={{
                borderBottom: i < candidates.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                borderLeft: activeCandidateId === c.id ? "2px solid var(--accent)" : "2px solid transparent",
              }}>
              <span className="text-base font-semibold w-10 font-mono" style={{ color: i === 0 ? "var(--accent)" : "var(--text-muted)" }}>
                #{i + 1}
              </span>
              <span className="flex-1">
                <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Candidate_{c.id.toString().padStart(3, "0")}</span>
                <span className="text-[11px] font-mono ml-2" style={{ color: "var(--text-faint)" }}>{c.sequence.length} bp</span>
              </span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--accent)" }}>{(c.scores.functional * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--base-c)" }}>{(c.scores.tissue * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: c.scores.offTarget > 0.03 ? "var(--base-t)" : "var(--accent)" }}>{(c.scores.offTarget * 100).toFixed(1)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "var(--base-g)" }}>{(c.scores.novelty * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-base font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{c.overall.toFixed(1)}</span>
              <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "var(--text-faint)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
