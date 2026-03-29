"use client";

import { useMemo } from "react";
import { useHelixStore } from "@/lib/store";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const BC: Record<string, string> = { A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855" };

export default function CompareView() {
  const candidates = useHelixStore((s) => s.candidates);
  const rawSequence = useHelixStore((s) => s.rawSequence);
  const regions = useHelixStore((s) => s.regions);
  const setViewMode = useHelixStore((s) => s.setViewMode);

  const candA = candidates[0];
  const candB = candidates[1];

  // Generate stable mock diffs based on sequence
  const diffs = useMemo(() => {
    if (!rawSequence || rawSequence.length < 20) return [];
    const bases = "ATCG";
    const result = [];
    for (let i = 0; i < Math.min(rawSequence.length, 200); i++) {
      // Deterministic pseudo-random from position
      const hash = ((i * 2654435761) >>> 0) % 100;
      if (hash < 8) { // ~8% of positions differ
        const orig = rawSequence[i];
        let alt = bases[(bases.indexOf(orig) + 1 + (hash % 3)) % 4];
        if (alt === orig) alt = bases[(bases.indexOf(orig) + 2) % 4];
        const delta = ((hash - 50) / 10) * (hash % 2 === 0 ? 1 : -1);
        result.push({ position: i, baseA: orig, baseB: alt, delta: Math.round(delta * 100) / 100 });
      }
    }
    return result.slice(0, 12);
  }, [rawSequence]);

  if (!candA || !candB) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#141416" }}>
        <p className="text-sm" style={{ color: "#888" }}>Need at least 2 candidates to compare.</p>
      </div>
    );
  }

  // Get a short region of sequence for the split-pane view
  const seqStart = diffs.length > 0 ? Math.max(0, diffs[0].position - 10) : 0;
  const seqEnd = Math.min(rawSequence.length, seqStart + 60);
  const seqSliceA = rawSequence.slice(seqStart, seqEnd);
  const diffPositionSet = new Set(diffs.map(d => d.position));

  return (
    <div className="flex-1 overflow-auto" style={{ background: "#141416" }}>
      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Comparison</h2>
            <p className="text-[13px]" style={{ color: "#999" }}>
              {diffs.length} position{diffs.length !== 1 ? "s" : ""} differ between candidates
            </p>
          </div>
          <button onClick={() => setViewMode("ide")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "#5bb5a2", color: "#141416" }}>
            Edit in Studio <ArrowRight size={14} />
          </button>
        </div>

        {/* ── SPLIT-PANE SEQUENCE DIFF ── */}
        <div className="rounded-xl overflow-hidden mb-6" style={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Candidate headers */}
          <div className="grid grid-cols-[1fr_80px_1fr]" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(91,181,162,0.1)", color: "#5bb5a2" }}>#1</span>
              <span className="text-sm font-medium" style={{ color: "#F0EFED" }}>Candidate_{candA.id.toString().padStart(3, "0")}</span>
              <span className="text-[11px] font-mono" style={{ color: "#666" }}>Overall: {candA.overall.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#666" }}>Diff</span>
            </div>
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(107,159,212,0.1)", color: "#6b9fd4" }}>#2</span>
              <span className="text-sm font-medium" style={{ color: "#F0EFED" }}>Candidate_{candB.id.toString().padStart(3, "0")}</span>
              <span className="text-[11px] font-mono" style={{ color: "#666" }}>Overall: {candB.overall.toFixed(1)}</span>
            </div>
          </div>

          {/* Sequence comparison: colored bases side by side */}
          <div className="grid grid-cols-[1fr_80px_1fr]">
            {/* Left sequence (Candidate A) */}
            <div className="px-5 py-4 font-mono text-[13px] leading-6 overflow-x-auto">
              <div className="flex gap-1">
                <span className="text-[10px] w-8 text-right shrink-0 tabular-nums select-none" style={{ color: "#555" }}>{seqStart}</span>
                <div className="flex flex-wrap">
                  {seqSliceA.split("").map((base, i) => {
                    const pos = seqStart + i;
                    const isDiff = diffPositionSet.has(pos);
                    return (
                      <span key={i} className="inline-block w-[1ch] text-center"
                        style={{
                          color: BC[base] ?? "#888",
                          background: isDiff ? "rgba(212,122,122,0.15)" : "transparent",
                          borderRadius: isDiff ? "2px" : "0",
                        }}>
                        {base}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center: diff markers */}
            <div className="py-4 flex flex-col items-center gap-0.5"
              style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", background: "#191919" }}>
              {diffs.filter(d => d.position >= seqStart && d.position < seqEnd).map((d) => (
                <div key={d.position} className="text-[9px] font-mono leading-tight text-center" style={{ color: "#888" }}>
                  {d.position}
                </div>
              ))}
            </div>

            {/* Right sequence (Candidate B - with mutations applied) */}
            <div className="px-5 py-4 font-mono text-[13px] leading-6 overflow-x-auto">
              <div className="flex gap-1">
                <span className="text-[10px] w-8 text-right shrink-0 tabular-nums select-none" style={{ color: "#555" }}>{seqStart}</span>
                <div className="flex flex-wrap">
                  {seqSliceA.split("").map((base, i) => {
                    const pos = seqStart + i;
                    const diff = diffs.find(d => d.position === pos);
                    const displayBase = diff ? diff.baseB : base;
                    const isDiff = !!diff;
                    return (
                      <span key={i} className="inline-block w-[1ch] text-center"
                        style={{
                          color: BC[displayBase] ?? "#888",
                          background: isDiff ? "rgba(91,181,162,0.15)" : "transparent",
                          borderRadius: isDiff ? "2px" : "0",
                        }}>
                        {displayBase}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Annotation track comparison */}
          <div className="grid grid-cols-[1fr_80px_1fr]" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-5 py-2">
              <div className="flex gap-px h-2 rounded overflow-hidden">
                {regions.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex-1" style={{
                    background: r.type === "exon" ? "rgba(124,107,196,0.4)" : r.type === "orf" ? "rgba(91,181,162,0.3)" : "rgba(60,60,60,0.3)",
                  }} />
                ))}
              </div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)" }} />
            <div className="px-5 py-2">
              <div className="flex gap-px h-2 rounded overflow-hidden">
                {regions.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex-1" style={{
                    background: r.type === "exon" ? "rgba(124,107,196,0.4)" : r.type === "orf" ? "rgba(91,181,162,0.3)" : "rgba(60,60,60,0.3)",
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SCORE COMPARISON ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Score deltas */}
          <div className="rounded-xl p-5" style={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "#888" }}>Score comparison</span>
            <div className="space-y-3">
              {[
                { label: "Functional", a: candA.scores.functional, b: candB.scores.functional, color: "#5bb5a2" },
                { label: "Tissue", a: candA.scores.tissue, b: candB.scores.tissue, color: "#6b9fd4" },
                { label: "Off-target", a: candA.scores.offTarget, b: candB.scores.offTarget, color: "#d47a7a" },
                { label: "Novelty", a: candA.scores.novelty, b: candB.scores.novelty, color: "#c9a855" },
              ].map((m) => {
                const delta = m.a - m.b;
                return (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="text-[12px] w-20 shrink-0" style={{ color: "#D1D0CC" }}>{m.label}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[12px] font-mono w-10" style={{ color: m.color }}>{(m.a * 100).toFixed(0)}%</span>
                      <div className="flex-1 h-1 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m.a * 100}%`, background: m.color, opacity: 0.5 }} />
                        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m.b * 100}%`, background: m.color, opacity: 0.25, borderRight: `1px solid ${m.color}` }} />
                      </div>
                      <span className="text-[12px] font-mono w-10" style={{ color: "#888" }}>{(m.b * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1 w-16 justify-end">
                      {delta > 0.01 ? <ArrowUpRight size={12} style={{ color: "#5bb5a2" }} /> :
                       delta < -0.01 ? <ArrowDownRight size={12} style={{ color: "#d47a7a" }} /> :
                       <Minus size={12} style={{ color: "#888" }} />}
                      <span className="text-[11px] font-mono" style={{ color: delta > 0.01 ? "#5bb5a2" : delta < -0.01 ? "#d47a7a" : "#888" }}>
                        {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Overall */}
            <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <span className="text-sm font-semibold" style={{ color: "#F0EFED" }}>Overall</span>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold font-mono" style={{ color: "#5bb5a2" }}>{candA.overall.toFixed(1)}</span>
                <span className="text-sm font-mono" style={{ color: "#888" }}>vs</span>
                <span className="text-xl font-bold font-mono" style={{ color: "#6b9fd4" }}>{candB.overall.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Position-level diffs */}
          <div className="rounded-xl p-5" style={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "#888" }}>
              Sequence differences ({diffs.length})
            </span>
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {diffs.map((d, i) => {
                const region = regions.find(r => d.position >= r.start && d.position < r.end);
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded transition-colors hover:bg-white/[0.02]">
                    <span className="text-[11px] font-mono w-14" style={{ color: "#888" }}>pos {d.position}</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: BC[d.baseA] ?? "#888" }}>{d.baseA}</span>
                    <span className="text-[10px]" style={{ color: "#555" }}>&rarr;</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: BC[d.baseB] ?? "#888" }}>{d.baseB}</span>
                    {region && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        background: region.type === "exon" || region.type === "orf" ? "rgba(91,181,162,0.08)" : "rgba(255,255,255,0.03)",
                        color: region.type === "exon" || region.type === "orf" ? "#5bb5a2" : "#666",
                      }}>{region.type}</span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[11px] font-mono" style={{ color: d.delta > 0 ? "#5bb5a2" : "#d47a7a" }}>
                      {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
