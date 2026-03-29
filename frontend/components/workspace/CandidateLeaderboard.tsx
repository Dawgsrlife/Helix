"use client";

import { useHelixStore } from "@/lib/store";
import { ChevronRight, ArrowRight } from "lucide-react";

export default function CandidateLeaderboard() {
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const setActiveCandidateId = useHelixStore((s) => s.setActiveCandidateId);
  const setViewMode = useHelixStore((s) => s.setViewMode);

  return (
    <div className="flex-1 overflow-auto px-8 py-6" style={{ background: "#141416" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Ranking</h2>
            <p className="text-[13px]" style={{ color: "#888" }}>{candidates.length} candidates scored and ranked by composite viability</p>
          </div>
          <button onClick={() => setViewMode("explorer")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "#5bb5a2", color: "#141416" }}>
            Inspect top candidate <ArrowRight size={14} />
          </button>
        </div>

        {/* Ranking table */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#222225", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "#666", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
              className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
              style={{
                borderBottom: i < candidates.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                borderLeft: activeCandidateId === c.id ? "2px solid #5bb5a2" : "2px solid transparent",
              }}>
              <span className="text-base font-semibold w-10 font-mono" style={{ color: i === 0 ? "#5bb5a2" : "#888" }}>
                #{i + 1}
              </span>
              <span className="flex-1">
                <span className="text-[13px] font-medium" style={{ color: "#F0EFED" }}>Candidate_{c.id.toString().padStart(3, "0")}</span>
                <span className="text-[11px] font-mono ml-2" style={{ color: "#555" }}>{c.sequence.length} bp</span>
              </span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "#5bb5a2" }}>{(c.scores.functional * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "#6b9fd4" }}>{(c.scores.tissue * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: c.scores.offTarget > 0.03 ? "#d47a7a" : "#5bb5a2" }}>{(c.scores.offTarget * 100).toFixed(1)}%</span>
              <span className="w-20 text-right text-[13px] font-mono" style={{ color: "#c9a855" }}>{(c.scores.novelty * 100).toFixed(0)}%</span>
              <span className="w-20 text-right text-base font-semibold font-mono" style={{ color: "#F0EFED" }}>{c.overall.toFixed(1)}</span>
              <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "#555" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
