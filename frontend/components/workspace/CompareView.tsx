"use client";

import { useHelixStore } from "@/lib/store";
import { ArrowRight } from "lucide-react";

const BASE_COLORS: Record<string, string> = {
  A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855",
};

export default function CompareView() {
  const candidates = useHelixStore((s) => s.candidates);
  const rawSequence = useHelixStore((s) => s.rawSequence);
  const setViewMode = useHelixStore((s) => s.setViewMode);

  const candA = candidates[0];
  const candB = candidates[1];

  if (!candA || !candB) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#0F0F0F" }}>
        <p className="text-sm" style={{ color: "#888" }}>Need at least 2 candidates to compare.</p>
      </div>
    );
  }

  // Generate some mock diff positions
  const diffPositions = Array.from({ length: 5 }, (_, i) => ({
    position: Math.floor(Math.random() * rawSequence.length),
    baseA: "ATCG"[Math.floor(Math.random() * 4)],
    baseB: "ATCG"[Math.floor(Math.random() * 4)],
    delta: (Math.random() - 0.5) * 4,
  })).filter(d => d.baseA !== d.baseB);

  return (
    <div className="flex-1 overflow-auto px-8 py-6" style={{ background: "#0F0F0F" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Comparison</h2>
            <p className="text-[13px]" style={{ color: "#888" }}>
              Comparing Candidate_{candA.id.toString().padStart(3, "0")} vs Candidate_{candB.id.toString().padStart(3, "0")}
            </p>
          </div>
          <button onClick={() => setViewMode("ide")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "#5bb5a2", color: "#0F0F0F" }}>
            Edit in IDE <ArrowRight size={14} />
          </button>
        </div>

        {/* Score comparison */}
        <div className="rounded-xl overflow-hidden mb-6" style={{ background: "#1A1917", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center px-5 py-3 text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "#666", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="w-40">Metric</span>
            <span className="flex-1 text-center">Candidate A</span>
            <span className="w-20 text-center">Delta</span>
            <span className="flex-1 text-center">Candidate B</span>
          </div>
          {[
            { label: "Functional", a: candA.scores.functional, b: candB.scores.functional, color: "#5bb5a2" },
            { label: "Tissue specificity", a: candA.scores.tissue, b: candB.scores.tissue, color: "#6b9fd4" },
            { label: "Off-target risk", a: candA.scores.offTarget, b: candB.scores.offTarget, color: "#d47a7a" },
            { label: "Novelty", a: candA.scores.novelty, b: candB.scores.novelty, color: "#c9a855" },
          ].map((m) => {
            const delta = m.a - m.b;
            return (
              <div key={m.label} className="flex items-center px-5 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span className="w-40 text-sm" style={{ color: "#D1D0CC" }}>{m.label}</span>
                <div className="flex-1 flex items-center justify-center gap-3">
                  <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="h-full rounded-full" style={{ width: `${m.a * 100}%`, background: m.color, opacity: 0.7 }} />
                  </div>
                  <span className="text-sm font-mono font-semibold" style={{ color: m.color }}>{(m.a * 100).toFixed(0)}%</span>
                </div>
                <span className="w-20 text-center text-xs font-mono" style={{ color: delta > 0 ? "#5bb5a2" : delta < 0 ? "#d47a7a" : "#888" }}>
                  {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}
                </span>
                <div className="flex-1 flex items-center justify-center gap-3">
                  <span className="text-sm font-mono font-semibold" style={{ color: m.color }}>{(m.b * 100).toFixed(0)}%</span>
                  <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="h-full rounded-full" style={{ width: `${m.b * 100}%`, background: m.color, opacity: 0.7 }} />
                  </div>
                </div>
              </div>
            );
          })}
          {/* Overall */}
          <div className="flex items-center px-5 py-4">
            <span className="w-40 text-sm font-semibold" style={{ color: "#F0EFED" }}>Overall</span>
            <div className="flex-1 text-center">
              <span className="text-xl font-bold font-mono" style={{ color: "#F0EFED" }}>{candA.overall.toFixed(1)}</span>
            </div>
            <span className="w-20 text-center text-sm font-mono font-semibold"
              style={{ color: candA.overall > candB.overall ? "#5bb5a2" : "#d47a7a" }}>
              {candA.overall > candB.overall ? "+" : ""}{(candA.overall - candB.overall).toFixed(1)}
            </span>
            <div className="flex-1 text-center">
              <span className="text-xl font-bold font-mono" style={{ color: "#F0EFED" }}>{candB.overall.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Sequence diff */}
        {diffPositions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#F0EFED" }}>Sequence differences</h3>
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1917", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center px-5 py-2 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "#666", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="w-24">Position</span>
                <span className="w-16 text-center">A</span>
                <span className="flex-1 text-center">Change</span>
                <span className="w-16 text-center">B</span>
                <span className="w-24 text-right">Delta LL</span>
              </div>
              {diffPositions.map((d, i) => (
                <div key={i} className="flex items-center px-5 py-3"
                  style={{ borderBottom: i < diffPositions.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                  <span className="w-24 text-xs font-mono" style={{ color: "#D1D0CC" }}>pos {d.position}</span>
                  <span className="w-16 text-center text-base font-mono font-semibold" style={{ color: BASE_COLORS[d.baseA] ?? "#888" }}>{d.baseA}</span>
                  <span className="flex-1 text-center text-xs" style={{ color: "#555" }}>&rarr;</span>
                  <span className="w-16 text-center text-base font-mono font-semibold" style={{ color: BASE_COLORS[d.baseB] ?? "#888" }}>{d.baseB}</span>
                  <span className="w-24 text-right text-xs font-mono" style={{ color: d.delta > 0 ? "#5bb5a2" : "#d47a7a" }}>
                    {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
