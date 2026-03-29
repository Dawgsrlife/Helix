"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Dna, FlaskConical, BarChart3, Search, Home } from "lucide-react";
import { useHelixStore } from "@/lib/store";
import { useSequenceAnalysis } from "@/hooks/useSequenceAnalysis";
import { useMutationSim } from "@/hooks/useMutationSim";
import SequenceInput from "@/components/sequence/SequenceInput";
import SequenceViewer from "@/components/sequence/SequenceViewer";
import AnnotationTrack from "@/components/annotation/AnnotationTrack";
import AnnotationLegend from "@/components/annotation/AnnotationLegend";
import LikelihoodGraph from "@/components/annotation/LikelihoodGraph";
import MutationPanel from "@/components/mutation/MutationPanel";
import MutationDiff from "@/components/mutation/MutationDiff";
import StructureControls from "@/components/structure/StructureControls";

const ProteinViewer = dynamic(
  () => import("@/components/structure/ProteinViewer"),
  { ssr: false }
);

const SIDEBAR_ITEMS = [
  { icon: Dna, label: "Sequencing", active: true },
  { icon: Search, label: "Proteomics", active: false },
  { icon: FlaskConical, label: "Synthesis", active: false },
  { icon: BarChart3, label: "Analysis", active: false },
];

export default function AnalyzePage() {
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
  const setSelectedPosition = useHelixStore((s) => s.setSelectedPosition);
  const setActivePdb = useHelixStore((s) => s.setActivePdb);
  const setHighlightResidues = useHelixStore((s) => s.setHighlightResidues);

  const { isLoading, error, analyze } = useSequenceAnalysis();
  const { simulate } = useMutationSim();

  // Auto-load protein structure when analysis completes
  useEffect(() => {
    if (analysisResult?.predictedProteins?.[0]?.pdbData && !activePdb) {
      setActivePdb(analysisResult.predictedProteins[0].pdbData);
    }
  }, [analysisResult, activePdb, setActivePdb]);

  const handleSequenceSubmit = useCallback(
    (sequence: string) => { analyze(sequence); },
    [analyze]
  );

  const handleBaseClick = useCallback(
    (position: number) => { setSelectedPosition(position); },
    [setSelectedPosition]
  );

  const handleMutationSubmit = useCallback(
    (position: number, alternate: string) => {
      if (rawSequence) simulate(rawSequence, position, alternate);
    },
    [rawSequence, simulate]
  );

  const showResults = analysisResult !== null;

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "#0e0e10", color: "#fffbfe" }}>
      {/* Sidebar */}
      <aside
        className="w-14 shrink-0 flex flex-col items-center py-4 gap-1"
        style={{ background: "#0a0a0c", borderRight: "0.5px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          href="/"
          className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 cursor-pointer transition-colors hover:bg-white/5"
          title="Home"
        >
          <Home size={18} style={{ color: "#5bb5a2" }} />
        </Link>

        {SIDEBAR_ITEMS.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            title={label}
            className="w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: active ? "rgba(147, 237, 217, 0.1)" : "transparent",
              color: active ? "#5bb5a2" : "#48474a",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon size={18} />
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="h-12 shrink-0 flex items-center justify-between px-5"
          style={{ background: "#0e0e10", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold tracking-[-0.04em] uppercase"
              style={{ fontWeight: 600, color: "#5bb5a2" }}
            >
              Helix
            </span>
            {showResults && (
              <>
                <span style={{ color: "#48474a" }}>/</span>
                <span className="text-xs font-mono" style={{ color: "#adaaad" }}>
                  Sequence Explorer
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono" style={{ color: "#48474a" }}>Evo 2 40B</span>
            <div
              className="w-[6px] h-[6px] rounded-full"
              style={{ background: "#5bb5a2", animation: "pulse-soft 2s ease-in-out infinite" }}
            />
          </div>
        </header>

        {/* Content area */}
        <AnimatePresence mode="wait">
          {!showResults ? (
            <motion.div
              key="input"
              className="flex-1 flex items-center justify-center overflow-auto py-12 px-6"
              style={{ background: "#0e0e10" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <SequenceInput
                onSubmit={handleSequenceSubmit}
                isLoading={isLoading}
                error={error}
              />
            </motion.div>
          ) : (
            <motion.div
              key="workspace"
              className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Annotation track */}
              <div className="px-5 py-2 shrink-0" style={{ background: "#131316" }}>
                <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                <AnnotationLegend regions={regions} />
              </div>

              {/* Main workspace: sequence + sidebar */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Sequence + Likelihood */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 overflow-auto px-5 py-4" style={{ background: "#0e0e10" }}>
                    <SequenceViewer
                      bases={bases}
                      regions={regions}
                      highlightedPosition={selectedPosition ?? undefined}
                      onBaseClick={handleBaseClick}
                    />
                  </div>
                  <div className="h-40 shrink-0 px-5 py-3" style={{ background: "#131316" }}>
                    <LikelihoodGraph
                      scores={scores}
                      highlightedPosition={selectedPosition ?? undefined}
                      onPositionHover={setSelectedPosition}
                    />
                  </div>
                </div>

                {/* Right sidebar panel */}
                <div
                  className="w-[340px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "#19191c", borderLeft: "0.5px solid rgba(255,255,255,0.06)" }}
                >
                  {/* Mutation panel */}
                  <div className="p-5">
                    <MutationPanel
                      sequence={rawSequence}
                      onMutationSubmit={handleMutationSubmit}
                      mutationEffect={mutationEffect ?? undefined}
                      isLoading={mutationLoading}
                    />
                    {mutationEffect && (
                      <div className="mt-4">
                        <MutationDiff effect={mutationEffect} />
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="h-px mx-5" style={{ background: "rgba(255,255,255,0.06)" }} />

                  {/* Structure viewer */}
                  <div className="p-5 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-[11px] font-medium uppercase tracking-[0.08em]"
                        style={{ color: "#6b6b6b" }}
                      >
                        Structure
                      </span>
                      {analysisResult.predictedProteins.length > 0 && (
                        <span className="text-[11px] font-mono" style={{ color: "#48474a" }}>
                          {analysisResult.predictedProteins.length} region
                          {analysisResult.predictedProteins.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {analysisResult.predictedProteins.length > 0 && (
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {analysisResult.predictedProteins.map((protein, i) => (
                          <button
                            key={i}
                            onClick={() => protein.pdbData && setActivePdb(protein.pdbData)}
                            className="px-2.5 py-1 text-[11px] rounded font-mono cursor-pointer transition-all"
                            style={{
                              background: activePdb === protein.pdbData ? "#262529" : "#1f1f22",
                              color: activePdb === protein.pdbData ? "#5bb5a2" : "#6b6b6b",
                            }}
                          >
                            {protein.regionStart}-{protein.regionEnd}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className="flex-1 rounded overflow-hidden min-h-[200px]"
                      style={{ background: "#0e0e10" }}
                    >
                      {activePdb ? (
                        <ProteinViewer pdbData={activePdb} highlightResidues={highlightResidues} />
                      ) : (
                        <div className="flex items-center justify-center h-full" style={{ color: "#48474a", fontSize: "12px" }}>
                          No protein data available
                        </div>
                      )}
                    </div>

                    <StructureControls
                      onReset={() => setHighlightResidues([])}
                      onHighlight={() =>
                        selectedPosition !== null
                          ? setHighlightResidues([selectedPosition])
                          : undefined
                      }
                    />
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
