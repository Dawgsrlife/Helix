"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna, FlaskConical, BarChart3, Search, Home,
  ChevronRight, Pencil, ArrowRight, Clock, Shield, Sparkles, Target,
} from "lucide-react";
import { useHelixStore } from "@/lib/store";
import { useSequenceAnalysis } from "@/hooks/useSequenceAnalysis";
import { useMutationSim } from "@/hooks/useMutationSim";
import HelixLogo from "@/components/brand/HelixLogo";
import SequenceInput from "@/components/sequence/SequenceInput";
import SequenceViewer from "@/components/sequence/SequenceViewer";
import AnnotationTrack from "@/components/annotation/AnnotationTrack";
import AnnotationLegend from "@/components/annotation/AnnotationLegend";
import LikelihoodGraph from "@/components/annotation/LikelihoodGraph";
import MutationPanel from "@/components/mutation/MutationPanel";
import CandidateLeaderboard from "@/components/workspace/CandidateLeaderboard";
import ChatPanel from "@/components/workspace/ChatPanel";
import PipelineStatus from "@/components/workspace/PipelineStatus";
import CompareView from "@/components/workspace/CompareView";
import MutationDiff from "@/components/mutation/MutationDiff";
import StructureControls from "@/components/structure/StructureControls";

const ProteinViewer = dynamic(() => import("@/components/structure/ProteinViewer"), { ssr: false });

const SIDEBAR_ITEMS = [
  { icon: Dna, label: "Sequencing", viewMode: "analyze" as const },
  { icon: Search, label: "Proteomics", viewMode: "explorer" as const },
  { icon: FlaskConical, label: "Synthesis", viewMode: "ide" as const },
  { icon: BarChart3, label: "Analysis", viewMode: "leaderboard" as const },
];

const VIEW_LABELS = {
  input: "New Analysis", pipeline: "Running", analyze: "Overview",
  leaderboard: "Candidates", explorer: "Explorer", ide: "Design Studio", compare: "Compare",
} as const;

export default function AnalyzePage() {
  const viewMode = useHelixStore((s) => s.viewMode);
  const rawSequence = useHelixStore((s) => s.rawSequence);
  const bases = useHelixStore((s) => s.bases);
  const regions = useHelixStore((s) => s.regions);
  const scores = useHelixStore((s) => s.scores);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const selectedPosition = useHelixStore((s) => s.selectedPosition);
  const activePdb = useHelixStore((s) => s.activePdb);
  const highlightResidues = useHelixStore((s) => s.highlightResidues);
  const mutationEffect = useHelixStore((s) => s.mutationEffect);
  const mutationLoading = useHelixStore((s) => s.mutationLoading);
  const editHistory = useHelixStore((s) => s.editHistory);
  const setViewMode = useHelixStore((s) => s.setViewMode);
  const setSelectedPosition = useHelixStore((s) => s.setSelectedPosition);
  const setActivePdb = useHelixStore((s) => s.setActivePdb);
  const setHighlightResidues = useHelixStore((s) => s.setHighlightResidues);
  const addEditEntry = useHelixStore((s) => s.addEditEntry);
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const chatOpen = useHelixStore((s) => s.chatOpen);
  const toggleChat = useHelixStore((s) => s.toggleChat);

  const { isLoading, error, analyze } = useSequenceAnalysis();
  const { simulate } = useMutationSim();

  useEffect(() => {
    if (analysisResult?.predictedProteins?.[0]?.pdbData && !activePdb) {
      setActivePdb(analysisResult.predictedProteins[0].pdbData);
    }
  }, [analysisResult, activePdb, setActivePdb]);

  const handleSequenceSubmit = useCallback((seq: string) => { analyze(seq); }, [analyze]);
  const handleBaseClick = useCallback((pos: number) => { setSelectedPosition(pos); }, [setSelectedPosition]);
  const handleMutationSubmit = useCallback((pos: number, alt: string) => {
    if (rawSequence) {
      simulate(rawSequence, pos, alt);
      addEditEntry({ position: pos, from: rawSequence[pos], to: alt, delta: 0 });
    }
  }, [rawSequence, simulate, addEditEntry]);

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>

      {/* Sidebar */}
      <aside className="w-14 shrink-0 flex flex-col items-center py-4 gap-1.5"
        style={{ background: "var(--surface-void)", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        <button onClick={() => setViewMode("input")} title="Home"
          className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors hover:bg-white/5"
          style={{
            color: viewMode === "input" || viewMode === "pipeline" ? "var(--accent)" : "var(--text-faint)",
            background: viewMode === "input" || viewMode === "pipeline" ? "oklch(0.72 0.12 180 / 0.08)" : "transparent",
          }}>
          <Home size={18} />
        </button>
        {SIDEBAR_ITEMS.map(({ icon: Icon, label, viewMode: target }) => {
          const isActive = viewMode === target || (target === "ide" && viewMode === "compare");
          return (
            <button key={target} title={label} onClick={() => setViewMode(target)}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-faint)",
                background: isActive ? "oklch(0.72 0.12 180 / 0.08)" : "transparent",
              }}>
              <Icon size={18} />
            </button>
          );
        })}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-5"
          style={{ background: "var(--surface-base)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <HelixLogo size="sm" className="text-[var(--accent)]" />
            {viewMode !== "input" && (
              <>
                <ChevronRight size={14} style={{ color: "var(--text-faint)" }} />
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{VIEW_LABELS[viewMode]}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {viewMode !== "input" && (
              <>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  {(["analyze", "leaderboard", "explorer", "ide", "compare"] as const).map((m) => (
                    <button key={m} onClick={() => setViewMode(m)}
                      className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors"
                      style={{ background: viewMode === m ? "rgba(91,181,162,0.1)" : "transparent", color: viewMode === m ? "var(--accent)" : "var(--text-muted)" }}>
                      {VIEW_LABELS[m]}
                    </button>
                  ))}
                </div>
                <button onClick={toggleChat}
                  className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-lg transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", color: chatOpen ? "var(--accent)" : "var(--text-muted)" }}>
                  Copilot
                </button>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono" style={{ color: "var(--text-faint)" }}>Evo 2</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {/* ═══ INPUT ═══ */}
          {viewMode === "input" && (
            <motion.div key="input" className="flex-1 flex overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <SequenceInput onSubmit={handleSequenceSubmit} isLoading={isLoading} error={error} />
            </motion.div>
          )}

          {/* ═══ PIPELINE: running ═══ */}
          {viewMode === "pipeline" && (
            <motion.div key="pipeline" className="flex-1"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <PipelineStatus />
            </motion.div>
          )}

          {/* ═══ ANALYZE: understand ═══ */}
          {viewMode === "analyze" && analysisResult && (() => {
            const topRegion = regions.reduce((best, r) => (r.score && (!best.score || Math.abs(r.score) < Math.abs(best.score))) ? r : best, regions[0]);
            const codingRegions = regions.filter(r => r.type === "exon" || r.type === "orf");
            const avgScore = scores.length > 0 ? (scores.reduce((a, s) => a + Math.abs(s.score), 0) / scores.length) : 0;
            return (
            <motion.div key="analyze" className="flex-1 overflow-auto"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

              {/* Summary strip */}
              <div className="px-8 py-6" style={{ background: "var(--surface-raised)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight mb-1">Analysis Complete</h2>
                    <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {rawSequence.length} bp analyzed across {regions.length} regions. {codingRegions.length} coding region{codingRegions.length !== 1 ? "s" : ""} identified.
                    </p>
                  </div>
                  <button onClick={() => setViewMode("explorer")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                    Open Explorer <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              <div className="px-8 py-6 max-w-6xl mx-auto">
                {/* Annotation track full-width */}
                <div className="mb-6">
                  <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                  <AnnotationLegend regions={regions} />
                </div>

                {/* Two-column: regions + insights */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 2/3: Region list */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Identified regions</h3>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{regions.length} total</span>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-elevated)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      {/* Table header */}
                      <div className="flex items-center gap-4 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-muted)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span className="w-6">#</span>
                        <span className="flex-1">Region</span>
                        <span className="w-20 text-right">Type</span>
                        <span className="w-24 text-right">Position</span>
                        <span className="w-16 text-right">Length</span>
                        <span className="w-16 text-right">Score</span>
                        <span className="w-8" />
                      </div>
                      {regions.slice(0, 10).map((r, i) => (
                        <button key={i} onClick={() => { setSelectedPosition(r.start); setViewMode("explorer"); }}
                          className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                          style={{ borderBottom: i < Math.min(regions.length, 10) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <span className="text-xs font-mono w-6" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                          <span className="text-[13px] font-medium flex-1" style={{ color: "var(--text-primary)" }}>{r.label ?? `${r.type} ${i + 1}`}</span>
                          <span className="text-[11px] font-mono w-20 text-right px-1.5 py-0.5 rounded"
                            style={{
                              color: r.type === "exon" || r.type === "orf" ? "var(--accent)" : "var(--text-muted)",
                              background: r.type === "exon" || r.type === "orf" ? "rgba(91,181,162,0.08)" : "transparent",
                            }}>
                            {r.type}
                          </span>
                          <span className="text-xs font-mono w-24 text-right" style={{ color: "var(--text-secondary)" }}>{r.start}-{r.end}</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: "var(--text-muted)" }}>{r.end - r.start} bp</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: r.score && Math.abs(r.score) < 2 ? "var(--accent)" : "var(--base-t)" }}>
                            {r.score?.toFixed(1) ?? "-"}
                          </span>
                          <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "var(--text-faint)" }} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right 1/3: Insights */}
                  <div className="space-y-4">
                    {/* Top candidate */}
                    {topRegion && (
                      <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)", border: "1px solid rgba(91,181,162,0.15)" }}>
                        <div className="flex items-center gap-2 mb-3">
                          <Target size={14} style={{ color: "var(--accent)" }} />
                          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>Top region</span>
                        </div>
                        <div className="text-base font-semibold mb-1">{topRegion.label ?? topRegion.type}</div>
                        <div className="text-xs font-mono mb-3" style={{ color: "var(--text-secondary)" }}>{topRegion.start}-{topRegion.end} ({topRegion.end - topRegion.start} bp)</div>
                        <button onClick={() => { setSelectedPosition(topRegion.start); setViewMode("explorer"); }}
                          className="text-xs font-medium flex items-center gap-1 transition-colors hover:text-white"
                          style={{ color: "var(--accent)" }}>
                          Inspect this region <ArrowRight size={12} />
                        </button>
                      </div>
                    )}

                    {/* Quick stats */}
                    <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Summary</span>
                      <div className="mt-3 space-y-3">
                        {[
                          { label: "Coding regions", value: String(codingRegions.length), color: "var(--accent)" },
                          { label: "Mean confidence", value: avgScore.toFixed(2), color: "var(--base-c)" },
                          { label: "Proteins predicted", value: String(analysisResult.predictedProteins.length), color: "var(--base-g)" },
                          { label: "Sequence length", value: `${rawSequence.length} bp`, color: "var(--text-secondary)" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                            <span className="text-sm font-semibold font-mono" style={{ color }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Model note */}
                    <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Model</span>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        Scored by Evo 2 (40B parameters, 9T base pairs). Per-position log-likelihood indicates functional constraint. Lower absolute scores suggest higher evolutionary conservation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })()}

          {/* ═══ LEADERBOARD: rank/triage ═══ */}
          {viewMode === "leaderboard" && analysisResult && (
            <motion.div key="leaderboard" className="flex-1 flex overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <CandidateLeaderboard />
              {chatOpen && <ChatPanel />}
            </motion.div>
          )}

          {/* ═══ COMPARE: diff ═══ */}
          {viewMode === "compare" && analysisResult && (
            <motion.div key="compare" className="flex-1 flex overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <CompareView />
              {chatOpen && <ChatPanel />}
            </motion.div>
          )}

          {/* ═══ EXPLORER: inspect (read-only, navigational) ═══ */}
          {viewMode === "explorer" && analysisResult && (
            <motion.div key="explorer" className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {/* Explorer has annotation track prominently */}
              <div className="px-5 py-3 shrink-0" style={{ background: "var(--surface-raised)" }}>
                <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                <AnnotationLegend regions={regions} />
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Sequence view (read-only focus) */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 overflow-auto px-5 py-4">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <div className="h-40 shrink-0 px-5 py-3" style={{ background: "var(--surface-raised)" }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </div>
                </div>
                {/* Inspector panel: context-sensitive, read-only details */}
                <div className="w-[320px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "var(--surface-elevated)", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                  {/* Region info (when position selected) */}
                  <div className="p-5 pb-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--accent)" }}>Inspector</span>
                    {selectedPosition !== null ? (
                      <div className="space-y-3">
                        <div>
                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Position</span>
                          <div className="text-lg font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{selectedPosition}</div>
                        </div>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Base</span>
                          <div className="text-lg font-semibold font-mono" style={{ color: bases[selectedPosition]?.nucleotide === "A" ? "var(--base-a)" : bases[selectedPosition]?.nucleotide === "T" ? "var(--base-t)" : bases[selectedPosition]?.nucleotide === "C" ? "var(--base-c)" : "var(--base-g)" }}>
                            {bases[selectedPosition]?.nucleotide ?? "N"}
                          </div>
                        </div>
                        {bases[selectedPosition]?.annotationType && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Region</span>
                            <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{bases[selectedPosition]?.annotationType}</div>
                          </div>
                        )}
                        {bases[selectedPosition]?.likelihoodScore !== undefined && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Likelihood</span>
                            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>{bases[selectedPosition]?.likelihoodScore?.toFixed(3)}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Click a base in the sequence to inspect its position, annotation, and likelihood score.
                      </p>
                    )}
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {/* Region summary */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Regions ({regions.length})</span>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {regions.slice(0, 6).map((r, i) => (
                        <button key={i} onClick={() => setSelectedPosition(r.start)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/[0.04]"
                          style={{ fontSize: "12px" }}>
                          <span style={{ color: "var(--text-muted)" }}>{r.type}</span>
                          <span className="flex-1" />
                          <span className="font-mono" style={{ color: "var(--text-faint)" }}>{r.start}-{r.end}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {/* Structure preview (smaller, read-only) */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Structure</span>
                    <div className="rounded-lg overflow-hidden h-[140px]" style={{ background: "var(--surface-base)" }}>
                      {activePdb ? <ProteinViewer pdbData={activePdb} highlightResidues={highlightResidues} /> : (
                        <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--text-faint)" }}>No structure</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1" />
                  {/* CTA to IDE */}
                  <div className="p-5">
                    <button onClick={() => setViewMode("ide")}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.01]"
                      style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                      <Pencil size={14} /> Open in Design Studio
                    </button>
                  </div>
                </div>
                {chatOpen && <ChatPanel />}
              </div>
            </motion.div>
          )}

          {/* ═══ IDE / DESIGN STUDIO: manipulate (editable, dense, operational) ═══ */}
          {viewMode === "ide" && analysisResult && (
            <motion.div key="ide" className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {/* IDE toolbar: controls, status, actions */}
              <div className="h-10 shrink-0 flex items-center justify-between px-5"
                style={{ background: "var(--surface-raised)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(91,181,162,0.1)", color: "var(--accent)" }}>LIVE EDITING</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {rawSequence.length} bp | {editHistory.length} edit{editHistory.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    Save version
                  </button>
                  <button className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    Revert
                  </button>
                  <button onClick={() => setViewMode("compare")}
                    className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    Compare
                  </button>
                  <button className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                    Rescore
                  </button>
                </div>
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Editable workspace */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="px-5 py-2 shrink-0" style={{ background: "var(--surface-raised)" }}>
                    <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                  </div>
                  <div className="flex-1 overflow-auto px-5 py-3">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <div className="h-36 shrink-0 px-5 py-3" style={{ background: "var(--surface-raised)" }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </div>
                </div>
                {/* IDE right panel: mutation + scoring + structure + history */}
                <div className="w-[380px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "var(--surface-elevated)", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                  {/* Mutation editor (primary tool in IDE) */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--accent)" }}>Mutation Editor</span>
                    <MutationPanel sequence={rawSequence} onMutationSubmit={handleMutationSubmit}
                      mutationEffect={mutationEffect ?? undefined} isLoading={mutationLoading} />
                    {mutationEffect && <div className="mt-4"><MutationDiff effect={mutationEffect} /></div>}
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {/* Scoring summary (IDE shows all 4 dims) */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Candidate scores</span>
                    {candidates.length > 0 && (() => {
                      const c = candidates.find(c => c.id === (activeCandidateId ?? 0)) ?? candidates[0];
                      return (
                        <div className="space-y-2">
                          {[
                            { label: "Functional", val: c.scores.functional, color: "var(--accent)" },
                            { label: "Tissue", val: c.scores.tissue, color: "var(--base-c)" },
                            { label: "Off-target", val: c.scores.offTarget, color: "var(--base-t)" },
                            { label: "Novelty", val: c.scores.novelty, color: "var(--base-g)" },
                          ].map(({ label, val, color }) => (
                            <div key={label} className="flex items-center gap-3">
                              <span className="text-[11px] w-16" style={{ color: "var(--text-muted)" }}>{label}</span>
                              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                                <div className="h-full rounded-full" style={{ width: `${val * 100}%`, background: color, opacity: 0.7 }} />
                              </div>
                              <span className="text-[11px] font-mono w-10 text-right" style={{ color }}>{(val * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {/* Structure */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Structure</span>
                    <div className="rounded-lg overflow-hidden h-[160px]" style={{ background: "var(--surface-base)" }}>
                      {activePdb ? <ProteinViewer pdbData={activePdb} highlightResidues={highlightResidues} /> : (
                        <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--text-faint)" }}>No structure</div>
                      )}
                    </div>
                    <StructureControls onReset={() => setHighlightResidues([])}
                      onHighlight={() => selectedPosition !== null ? setHighlightResidues([selectedPosition]) : undefined} />
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  {/* Edit history (IDE exclusive) */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Edit history ({editHistory.length})
                    </span>
                    {editHistory.length === 0 ? (
                      <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>Click a base, select a target, and run simulation to begin editing.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {editHistory.slice(-8).reverse().map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono py-1" style={{ color: "var(--text-secondary)" }}>
                            <span style={{ color: "var(--text-faint)" }}>pos {e.position}</span>
                            <span style={{ color: "var(--base-t)" }}>{e.from}</span>
                            <span style={{ color: "var(--text-faint)" }}>&rarr;</span>
                            <span style={{ color: "var(--accent)" }}>{e.to}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {chatOpen && <ChatPanel />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
