"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
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
  { icon: Dna, label: "Sequencing", id: "seq" },
  { icon: Search, label: "Proteomics", id: "prot" },
  { icon: FlaskConical, label: "Synthesis", id: "synth" },
  { icon: BarChart3, label: "Analysis", id: "analysis" },
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
    <div className="h-screen flex overflow-hidden" style={{ background: "#141416", color: "#F0EFED" }}>

      {/* Sidebar */}
      <aside className="w-14 shrink-0 flex flex-col items-center py-4 gap-1"
        style={{ background: "#0a0a0c", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        <Link href="/" className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 hover:bg-white/5 transition-colors" title="Home">
          <Home size={18} style={{ color: "#5bb5a2" }} />
        </Link>
        {SIDEBAR_ITEMS.map(({ icon: Icon, label, id }) => (
          <button key={id} title={label}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: id === "seq" ? "#5bb5a2" : "#555" }}>
            <Icon size={18} />
          </button>
        ))}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-5"
          style={{ background: "#141416", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <HelixLogo size="sm" className="text-[#5bb5a2]" />
            {viewMode !== "input" && (
              <>
                <ChevronRight size={14} style={{ color: "#555" }} />
                <span className="text-[13px]" style={{ color: "#D1D0CC" }}>{VIEW_LABELS[viewMode]}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {viewMode !== "input" && (
              <>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  {(["analyze", "leaderboard", "explorer", "ide", "compare"] as const).map((m) => (
                    <button key={m} onClick={() => setViewMode(m)}
                      className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors"
                      style={{ background: viewMode === m ? "rgba(91,181,162,0.1)" : "transparent", color: viewMode === m ? "#5bb5a2" : "#666" }}>
                      {VIEW_LABELS[m]}
                    </button>
                  ))}
                </div>
                <button onClick={toggleChat}
                  className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded-lg transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", color: chatOpen ? "#5bb5a2" : "#666" }}>
                  Copilot
                </button>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono" style={{ color: "#555" }}>Evo 2</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#5bb5a2] animate-pulse" />
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
              <div className="px-8 py-5" style={{ background: "#1c1c1f", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight mb-1">Analysis Complete</h2>
                    <p className="text-[13px]" style={{ color: "#D1D0CC" }}>
                      {rawSequence.length} bp analyzed across {regions.length} regions. {codingRegions.length} coding region{codingRegions.length !== 1 ? "s" : ""} identified.
                    </p>
                  </div>
                  <button onClick={() => setViewMode("explorer")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
                    style={{ background: "#5bb5a2", color: "#141416" }}>
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
                      <h3 className="text-sm font-semibold" style={{ color: "#F0EFED" }}>Identified regions</h3>
                      <span className="text-xs font-mono" style={{ color: "#888" }}>{regions.length} total</span>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ background: "#222225", border: "1px solid rgba(255,255,255,0.04)" }}>
                      {/* Table header */}
                      <div className="flex items-center gap-4 px-5 py-2 text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "#666", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
                          className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                          style={{ borderBottom: i < Math.min(regions.length, 10) - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                          <span className="text-xs font-mono w-6" style={{ color: "#666" }}>{i + 1}</span>
                          <span className="text-[13px] font-medium flex-1" style={{ color: "#F0EFED" }}>{r.label ?? `${r.type} ${i + 1}`}</span>
                          <span className="text-[11px] font-mono w-20 text-right px-1.5 py-0.5 rounded"
                            style={{
                              color: r.type === "exon" || r.type === "orf" ? "#5bb5a2" : "#888",
                              background: r.type === "exon" || r.type === "orf" ? "rgba(91,181,162,0.08)" : "transparent",
                            }}>
                            {r.type}
                          </span>
                          <span className="text-xs font-mono w-24 text-right" style={{ color: "#D1D0CC" }}>{r.start}-{r.end}</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: "#888" }}>{r.end - r.start} bp</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: r.score && Math.abs(r.score) < 2 ? "#5bb5a2" : "#d47a7a" }}>
                            {r.score?.toFixed(1) ?? "-"}
                          </span>
                          <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "#555" }} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right 1/3: Insights */}
                  <div className="space-y-4">
                    {/* Top candidate */}
                    {topRegion && (
                      <div className="p-5 rounded-xl" style={{ background: "#222225", border: "1px solid rgba(91,181,162,0.15)" }}>
                        <div className="flex items-center gap-2 mb-3">
                          <Target size={14} style={{ color: "#5bb5a2" }} />
                          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5bb5a2" }}>Top region</span>
                        </div>
                        <div className="text-base font-semibold mb-1">{topRegion.label ?? topRegion.type}</div>
                        <div className="text-xs font-mono mb-3" style={{ color: "#D1D0CC" }}>{topRegion.start}-{topRegion.end} ({topRegion.end - topRegion.start} bp)</div>
                        <button onClick={() => { setSelectedPosition(topRegion.start); setViewMode("explorer"); }}
                          className="text-xs font-medium flex items-center gap-1 transition-colors hover:text-white"
                          style={{ color: "#5bb5a2" }}>
                          Inspect this region <ArrowRight size={12} />
                        </button>
                      </div>
                    )}

                    {/* Quick stats */}
                    <div className="p-5 rounded-xl" style={{ background: "#222225", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#888" }}>Summary</span>
                      <div className="mt-3 space-y-3">
                        {[
                          { label: "Coding regions", value: String(codingRegions.length), color: "#5bb5a2" },
                          { label: "Mean confidence", value: avgScore.toFixed(2), color: "#6b9fd4" },
                          { label: "Proteins predicted", value: String(analysisResult.predictedProteins.length), color: "#c9a855" },
                          { label: "Sequence length", value: `${rawSequence.length} bp`, color: "#D1D0CC" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: "#888" }}>{label}</span>
                            <span className="text-sm font-semibold font-mono" style={{ color }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Model note */}
                    <div className="p-5 rounded-xl" style={{ background: "#222225", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#888" }}>Model</span>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "#D1D0CC" }}>
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

          {/* ═══ EXPLORER: inspect ═══ */}
          {viewMode === "explorer" && analysisResult && (
            <motion.div key="explorer" className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="px-5 py-2 shrink-0" style={{ background: "#1c1c1f" }}>
                <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                <AnnotationLegend regions={regions} />
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 overflow-auto px-5 py-4">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <div className="h-40 shrink-0 px-5 py-3" style={{ background: "#1c1c1f" }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </div>
                </div>
                <div className="w-[340px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "#222225", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="p-5">
                    <MutationPanel sequence={rawSequence} onMutationSubmit={handleMutationSubmit}
                      mutationEffect={mutationEffect ?? undefined} isLoading={mutationLoading} />
                    {mutationEffect && <div className="mt-4"><MutationDiff effect={mutationEffect} /></div>}
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="p-5 flex-1 flex flex-col min-h-0">
                    <span className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#888" }}>Structure</span>
                    <div className="flex-1 rounded-lg overflow-hidden min-h-[180px]" style={{ background: "#141416" }}>
                      {activePdb ? <ProteinViewer pdbData={activePdb} highlightResidues={highlightResidues} /> : (
                        <div className="flex items-center justify-center h-full text-xs" style={{ color: "#555" }}>No structure data</div>
                      )}
                    </div>
                    <StructureControls onReset={() => setHighlightResidues([])}
                      onHighlight={() => selectedPosition !== null ? setHighlightResidues([selectedPosition]) : undefined} />
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="p-5">
                    <button onClick={() => setViewMode("ide")}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.01]"
                      style={{ background: "#5bb5a2", color: "#141416" }}>
                      <Pencil size={14} /> Open in Design Studio
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ IDE: manipulate ═══ */}
          {viewMode === "ide" && analysisResult && (
            <motion.div key="ide" className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="h-10 shrink-0 flex items-center justify-between px-5"
                style={{ background: "#1c1c1f", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="text-xs font-mono" style={{ color: "#888" }}>
                  {rawSequence.length} bp | {regions.length} regions | {editHistory.length} edit{editHistory.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(91,181,162,0.1)", color: "#5bb5a2" }}>LIVE</span>
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="px-5 py-1.5 shrink-0" style={{ background: "#1c1c1f" }}>
                    <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                  </div>
                  <div className="flex-1 overflow-auto px-5 py-3">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <div className="h-36 shrink-0 px-5 py-2" style={{ background: "#1c1c1f" }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </div>
                </div>
                <div className="w-[360px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "#222225", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="p-5">
                    <MutationPanel sequence={rawSequence} onMutationSubmit={handleMutationSubmit}
                      mutationEffect={mutationEffect ?? undefined} isLoading={mutationLoading} />
                    {mutationEffect && <div className="mt-4"><MutationDiff effect={mutationEffect} /></div>}
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="p-5 flex-1 flex flex-col min-h-0">
                    <span className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#888" }}>Structure</span>
                    <div className="flex-1 rounded-lg overflow-hidden min-h-[160px]" style={{ background: "#141416" }}>
                      {activePdb ? <ProteinViewer pdbData={activePdb} highlightResidues={highlightResidues} /> : (
                        <div className="flex items-center justify-center h-full text-xs" style={{ color: "#555" }}>No structure</div>
                      )}
                    </div>
                    <StructureControls onReset={() => setHighlightResidues([])}
                      onHighlight={() => selectedPosition !== null ? setHighlightResidues([selectedPosition]) : undefined} />
                  </div>
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#888" }}>
                      Edit history ({editHistory.length})
                    </span>
                    {editHistory.length === 0 ? (
                      <p className="text-xs mt-2" style={{ color: "#555" }}>No edits yet. Click a base, select a target, and run simulation.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {editHistory.slice(-5).reverse().map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono py-1" style={{ color: "#D1D0CC" }}>
                            <span style={{ color: "#555" }}>pos {e.position}</span>
                            <span style={{ color: "#d47a7a" }}>{e.from}</span>
                            <span style={{ color: "#555" }}>&rarr;</span>
                            <span style={{ color: "#5bb5a2" }}>{e.to}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
