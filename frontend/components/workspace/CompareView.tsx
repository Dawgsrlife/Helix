"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useHelixStore } from "@/lib/store";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Box } from "lucide-react";

const ProteinViewer = dynamic(() => import("@/components/structure/ProteinViewer"), { ssr: false });

const BC: Record<string, string> = { A: "var(--base-a)", T: "var(--base-t)", C: "var(--base-c)", G: "var(--base-g)" };

export default function CompareView() {
  const candidates = useHelixStore((s) => s.candidates);
  const rawSequence = useHelixStore((s) => s.rawSequence);
  const regions = useHelixStore((s) => s.regions);
  const setViewMode = useHelixStore((s) => s.setViewMode);

  const activePdb = useHelixStore((s) => s.activePdb);
  const originalPdb = useHelixStore((s) => s.originalPdb);
  const theme = useHelixStore((s) => s.theme);

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
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--surface-base)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Need at least 2 candidates to compare.</p>
      </div>
    );
  }

  // Get a short region of sequence for the split-pane view
  const seqStart = diffs.length > 0 ? Math.max(0, diffs[0].position - 10) : 0;
  const seqEnd = Math.min(rawSequence.length, seqStart + 60);
  const seqSliceA = rawSequence.slice(seqStart, seqEnd);
  const diffPositionSet = new Set(diffs.map(d => d.position));

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--surface-base)" }}>
      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-1">Candidate Comparison</h2>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {diffs.length} position{diffs.length !== 1 ? "s" : ""} differ between candidates.
              Each letter (A, T, C, G) is a DNA base — highlighted positions show where the two candidates diverge.
              Positive score deltas mean the change improves that metric.
            </p>
          </div>
          <button onClick={() => setViewMode("ide")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
            Edit in Studio <ArrowRight size={14} />
          </button>
        </div>

        {/* ── SPLIT-PANE SEQUENCE DIFF ── */}
        <div className="rounded-xl overflow-hidden mb-6" style={{ background: "var(--surface-raised)" }}>
          {/* Candidate headers */}
          <div className="grid grid-cols-[1fr_80px_1fr]" style={{ borderBottom: "1px solid var(--ghost-border)" }}>
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ background: "color-mix(in oklch, var(--accent), transparent 90%)", color: "var(--accent)" }}>#1</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Candidate_{candA.id.toString().padStart(3, "0")}</span>
              <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>Overall: {candA.overall.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-center" style={{ borderLeft: "1px solid var(--ghost-border)" }}>
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>Diff</span>
            </div>
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(107,159,212,0.1)", color: "var(--base-c)" }}>#2</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Candidate_{candB.id.toString().padStart(3, "0")}</span>
              <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>Overall: {candB.overall.toFixed(1)}</span>
            </div>
          </div>

          {/* Sequence comparison: colored bases side by side */}
          <div className="grid grid-cols-[1fr_80px_1fr]">
            {/* Left sequence (Candidate A) */}
            <div className="px-5 py-4 font-mono text-[13px] leading-6 overflow-x-auto">
              <div className="flex gap-1">
                <span className="text-[10px] w-8 text-right shrink-0 tabular-nums select-none" style={{ color: "var(--text-faint)" }}>{seqStart}</span>
                <div className="flex flex-wrap">
                  {seqSliceA.split("").map((base, i) => {
                    const pos = seqStart + i;
                    const isDiff = diffPositionSet.has(pos);
                    return (
                      <span key={i} className="inline-block w-[1ch] text-center"
                        style={{
                          color: BC[base] ?? "var(--text-muted)",
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
              style={{ background: "var(--surface-base)" }}>
              {diffs.filter(d => d.position >= seqStart && d.position < seqEnd).map((d) => (
                <div key={d.position} className="text-[9px] font-mono leading-tight text-center" style={{ color: "var(--text-muted)" }}>
                  {d.position}
                </div>
              ))}
            </div>

            {/* Right sequence (Candidate B - with mutations applied) */}
            <div className="px-5 py-4 font-mono text-[13px] leading-6 overflow-x-auto">
              <div className="flex gap-1">
                <span className="text-[10px] w-8 text-right shrink-0 tabular-nums select-none" style={{ color: "var(--text-faint)" }}>{seqStart}</span>
                <div className="flex flex-wrap">
                  {seqSliceA.split("").map((base, i) => {
                    const pos = seqStart + i;
                    const diff = diffs.find(d => d.position === pos);
                    const displayBase = diff ? diff.baseB : base;
                    const isDiff = !!diff;
                    return (
                      <span key={i} className="inline-block w-[1ch] text-center"
                        style={{
                          color: BC[displayBase] ?? "var(--text-muted)",
                          background: isDiff ? "color-mix(in oklch, var(--accent), transparent 85%)" : "transparent",
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
          <div className="grid grid-cols-[1fr_80px_1fr]" style={{ borderTop: "1px solid var(--ghost-border)" }}>
            <div className="px-5 py-2">
              <div className="flex gap-px h-2 rounded overflow-hidden">
                {regions.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex-1" style={{
                    background: r.type === "exon" ? "rgba(124,107,196,0.4)" : r.type === "orf" ? "rgba(91,181,162,0.3)" : "rgba(60,60,60,0.3)",
                  }} />
                ))}
              </div>
            </div>
            <div style={{ borderLeft: "1px solid var(--ghost-border)" }} />
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
          <div className="rounded-xl p-5" style={{ background: "var(--surface-raised)" }}>
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Score comparison</span>
            <p className="text-[11px] mb-4" style={{ color: "var(--text-faint)" }}>How likely the sequence works (functional), targets the right tissue, avoids side effects (off-target), and is original (novelty).</p>
            <div className="space-y-3">
              {[
                { label: "Functional", a: candA.scores.functional, b: candB.scores.functional, color: "var(--accent)" },
                { label: "Tissue", a: candA.scores.tissue, b: candB.scores.tissue, color: "var(--base-c)" },
                { label: "Off-target", a: candA.scores.offTarget, b: candB.scores.offTarget, color: "var(--base-t)" },
                { label: "Novelty", a: candA.scores.novelty, b: candB.scores.novelty, color: "var(--base-g)" },
              ].map((m) => {
                const delta = m.a - m.b;
                return (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="text-xs w-20 shrink-0" style={{ color: "var(--text-secondary)" }}>{m.label}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs font-mono w-10" style={{ color: m.color }}>{(m.a * 100).toFixed(0)}%</span>
                      <div className="flex-1 h-1 rounded-full relative overflow-hidden" style={{ background: "var(--ghost-border)" }}>
                        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m.a * 100}%`, background: m.color, opacity: 0.5 }} />
                        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m.b * 100}%`, background: m.color, opacity: 0.25, borderRight: `1px solid ${m.color}` }} />
                      </div>
                      <span className="text-xs font-mono w-10" style={{ color: "var(--text-muted)" }}>{(m.b * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1 w-16 justify-end">
                      {delta > 0.01 ? <ArrowUpRight size={12} style={{ color: "var(--accent)" }} /> :
                       delta < -0.01 ? <ArrowDownRight size={12} style={{ color: "var(--base-t)" }} /> :
                       <Minus size={12} style={{ color: "var(--text-muted)" }} />}
                      <span className="text-[11px] font-mono" style={{ color: delta > 0.01 ? "var(--accent)" : delta < -0.01 ? "var(--base-t)" : "var(--text-muted)" }}>
                        {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Overall */}
            <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--ghost-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Overall</span>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>{candA.overall.toFixed(1)}</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>vs</span>
                <span className="text-xl font-bold font-mono" style={{ color: "var(--base-c)" }}>{candB.overall.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Position-level diffs */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface-raised)" }}>
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--text-muted)" }}>
              Sequence differences ({diffs.length})
            </span>
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {diffs.map((d, i) => {
                const region = regions.find(r => d.position >= r.start && d.position < r.end);
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded transition-colors hover:bg-white/[0.04]">
                    <span className="text-[11px] font-mono w-14" style={{ color: "var(--text-muted)" }}>pos {d.position}</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: BC[d.baseA] ?? "var(--text-muted)" }}>{d.baseA}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>&rarr;</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: BC[d.baseB] ?? "var(--text-muted)" }}>{d.baseB}</span>
                    {region && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        background: region.type === "exon" || region.type === "orf" ? "rgba(91,181,162,0.08)" : "var(--ghost-border)",
                        color: region.type === "exon" || region.type === "orf" ? "var(--accent)" : "var(--text-muted)",
                      }}>{region.type}</span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[11px] font-mono" style={{ color: d.delta > 0 ? "var(--accent)" : "var(--base-t)" }}>
                      {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── STRUCTURE COMPARISON: side by side ── */}
        {(activePdb || originalPdb) && (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-raised)" }}>
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--ghost-border)" }}>
              <Box size={14} style={{ color: "var(--accent)" }} />
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                3D Structure — Before & After
              </span>
              {originalPdb === activePdb && (
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-faint)" }}>
                  No edits yet — both show the same structure
                </span>
              )}
            </div>
            <div className="grid grid-cols-2" style={{ borderBottom: "1px solid var(--ghost-border)" }}>
              <div className="px-4 py-2 text-center" style={{ borderRight: "1px solid var(--ghost-border)" }}>
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Original</span>
              </div>
              <div className="px-4 py-2 text-center">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: originalPdb !== activePdb ? "var(--accent)" : "var(--text-muted)" }}>
                  {originalPdb !== activePdb ? "After Edits" : "Current"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2">
              <div className="h-[320px]" style={{ background: theme === "dark" ? "var(--surface-void)" : "var(--surface-base)", borderRight: "1px solid var(--ghost-border)" }}>
                <ProteinViewer
                  pdbData={originalPdb || undefined}
                  theme={theme}
                />
              </div>
              <div className="h-[320px]" style={{ background: theme === "dark" ? "var(--surface-void)" : "var(--surface-base)" }}>
                <ProteinViewer
                  pdbData={activePdb || undefined}
                  theme={theme}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
