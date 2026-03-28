"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHelixStore } from "@/lib/store";
import { useSequenceAnalysis } from "@/hooks/useSequenceAnalysis";
import { useMutationSim } from "@/hooks/useMutationSim";
import AppShell from "@/components/layout/AppShell";
import SequenceInput from "@/components/sequence/SequenceInput";
import SequenceViewer from "@/components/sequence/SequenceViewer";
import AnnotationTrack from "@/components/annotation/AnnotationTrack";
import AnnotationLegend from "@/components/annotation/AnnotationLegend";
import LikelihoodGraph from "@/components/annotation/LikelihoodGraph";
import MutationPanel from "@/components/mutation/MutationPanel";
import MutationDiff from "@/components/mutation/MutationDiff";
import StructureControls from "@/components/structure/StructureControls";

// Dynamic import for Three.js to avoid SSR issues and reduce initial bundle
const ProteinViewer = dynamic(
  () => import("@/components/structure/ProteinViewer"),
  { ssr: false }
);

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

export default function AnalyzePage() {
  // Zustand selectors
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

  const handleSequenceSubmit = useCallback(
    (sequence: string) => {
      analyze(sequence);
    },
    [analyze]
  );

  const handleBaseClick = useCallback(
    (position: number) => {
      setSelectedPosition(position);
    },
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
    <AppShell sequenceName={showResults ? "analysis_session" : undefined}>
      <AnimatePresence mode="wait">
        {!showResults ? (
          <motion.div
            key="input"
            className="flex-1 flex items-center justify-center"
            style={{ background: "var(--surface-void)" }}
            {...fadeUp}
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
            style={{ background: "var(--surface-void)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {/* Top: Annotation Track */}
            <div
              className="px-5 py-2.5"
              style={{ background: "var(--surface-base)" }}
            >
              <AnnotationTrack
                regions={regions}
                sequenceLength={rawSequence.length}
              />
              <AnnotationLegend regions={regions} />
            </div>

            {/* Middle: Sequence Viewer + Right Sidebar */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Sequence + Likelihood */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Sequence viewer */}
                <div
                  className="flex-1 overflow-auto px-5 py-4"
                  style={{ background: "var(--surface-void)" }}
                >
                  <SequenceViewer
                    bases={bases}
                    regions={regions}
                    highlightedPosition={selectedPosition ?? undefined}
                    onBaseClick={handleBaseClick}
                  />
                </div>

                {/* Likelihood graph */}
                <div
                  className="h-44 px-5 py-3"
                  style={{ background: "var(--surface-base)" }}
                >
                  <LikelihoodGraph
                    scores={scores}
                    highlightedPosition={selectedPosition ?? undefined}
                    onPositionHover={setSelectedPosition}
                  />
                </div>
              </div>

              {/* Right sidebar */}
              <div
                className="w-[360px] shrink-0 flex flex-col overflow-hidden"
                style={{ background: "var(--surface-raised)" }}
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

                {/* Divider via tonal shift */}
                <div
                  className="h-px mx-5"
                  style={{ background: "var(--surface-overlay)", opacity: 0.5 }}
                />

                {/* Protein structure viewer */}
                <div className="flex-1 flex flex-col p-5 min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[11px] font-medium uppercase tracking-[0.08em]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Structure
                    </span>
                    {analysisResult.predictedProteins.length > 0 && (
                      <span
                        className="text-[11px] font-mono"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {analysisResult.predictedProteins.length} region
                        {analysisResult.predictedProteins.length !== 1
                          ? "s"
                          : ""}
                      </span>
                    )}
                  </div>

                  {/* Protein region buttons */}
                  {analysisResult.predictedProteins.length > 0 && (
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      {analysisResult.predictedProteins.map((protein, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            protein.pdbData && setActivePdb(protein.pdbData)
                          }
                          className="px-2.5 py-1 text-[11px] rounded-md font-mono transition-all"
                          style={{
                            background:
                              activePdb === protein.pdbData
                                ? "var(--surface-overlay)"
                                : "var(--surface-elevated)",
                            color:
                              activePdb === protein.pdbData
                                ? "var(--accent)"
                                : "var(--text-muted)",
                          }}
                        >
                          {protein.regionStart}-{protein.regionEnd}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 3D viewer */}
                  <div
                    className="flex-1 rounded-lg overflow-hidden min-h-[240px]"
                    style={{ background: "var(--surface-base)" }}
                  >
                    {activePdb ? (
                      <ProteinViewer
                        pdbData={activePdb}
                        highlightResidues={highlightResidues}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center h-full"
                        style={{ color: "var(--text-faint)", fontSize: "12px" }}
                      >
                        {analysisResult.predictedProteins.length > 0
                          ? "Select a region above"
                          : "No protein regions predicted"}
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
    </AppShell>
  );
}
