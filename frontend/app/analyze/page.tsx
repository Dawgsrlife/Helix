"use client";

import { useState } from "react";
import type { AnalysisResult, MutationEffect } from "@/types";
import { useSequenceAnalysis } from "@/hooks/useSequenceAnalysis";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useMutationSim } from "@/hooks/useMutationSim";
import AppShell from "@/components/layout/AppShell";
import SequenceInput from "@/components/sequence/SequenceInput";
import SequenceViewer from "@/components/sequence/SequenceViewer";
import AnnotationTrack from "@/components/annotation/AnnotationTrack";
import AnnotationLegend from "@/components/annotation/AnnotationLegend";
import LikelihoodGraph from "@/components/annotation/LikelihoodGraph";
import MutationPanel from "@/components/mutation/MutationPanel";
import MutationDiff from "@/components/mutation/MutationDiff";
import ProteinViewer from "@/components/structure/ProteinViewer";
import StructureControls from "@/components/structure/StructureControls";

export default function AnalyzePage() {
  const [rawSequence, setRawSequence] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [activePdb, setActivePdb] = useState<string | null>(null);
  const [highlightResidues, setHighlightResidues] = useState<number[]>([]);

  const {
    result,
    isLoading: analysisLoading,
    error: analysisError,
    analyze,
  } = useSequenceAnalysis();

  const { regions, bases } = useAnnotations(result);

  const {
    effect: mutationEffect,
    isLoading: mutationLoading,
    simulate,
  } = useMutationSim();

  const handleSequenceSubmit = (sequence: string) => {
    setRawSequence(sequence);
    setSelectedPosition(null);
    analyze(sequence);
  };

  const handleBaseClick = (position: number) => {
    setSelectedPosition(position);
  };

  const handleMutationSubmit = (position: number, alternate: string) => {
    if (rawSequence) {
      simulate(rawSequence, position, alternate);
    }
  };

  const handleProteinSelect = (pdbData: string) => {
    setActivePdb(pdbData);
  };

  const showResults = result !== null;

  return (
    <AppShell>
      {!showResults ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <SequenceInput
            onSubmit={handleSequenceSubmit}
            isLoading={analysisLoading}
            error={analysisError}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Annotation Track */}
          <div className="border-b border-[var(--border-subtle)] px-4 py-2">
            <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
            <AnnotationLegend regions={regions} />
          </div>

          {/* Middle: Sequence Viewer + Likelihood Graph */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sequence viewer */}
              <div className="flex-1 overflow-auto p-4">
                <SequenceViewer
                  bases={bases}
                  regions={regions}
                  highlightedPosition={selectedPosition ?? undefined}
                  onBaseClick={handleBaseClick}
                />
              </div>

              {/* Likelihood graph */}
              <div className="h-48 border-t border-[var(--border-subtle)] p-4">
                <LikelihoodGraph
                  scores={result.perPositionScores}
                  highlightedPosition={selectedPosition ?? undefined}
                  onPositionHover={setSelectedPosition}
                />
              </div>
            </div>

            {/* Right sidebar: Mutation + Structure */}
            <div className="w-96 border-l border-[var(--border-subtle)] flex flex-col overflow-hidden">
              {/* Mutation panel */}
              <div className="border-b border-[var(--border-subtle)] p-4">
                <MutationPanel
                  sequence={rawSequence}
                  onMutationSubmit={handleMutationSubmit}
                  mutationEffect={mutationEffect ?? undefined}
                  isLoading={mutationLoading}
                />
                {mutationEffect && (
                  <MutationDiff effect={mutationEffect} />
                )}
              </div>

              {/* Protein structure viewer */}
              <div className="flex-1 flex flex-col p-4">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Protein Structure
                </h3>
                {result.predictedProteins.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {result.predictedProteins.map((protein, i) => (
                      <button
                        key={i}
                        onClick={() =>
                          protein.pdbData && handleProteinSelect(protein.pdbData)
                        }
                        className="px-2 py-1 text-xs rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent-cyan)] transition-colors text-[var(--text-secondary)]"
                      >
                        Region {protein.regionStart}-{protein.regionEnd}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 rounded-lg overflow-hidden bg-[var(--bg-secondary)] min-h-[300px]">
                  {activePdb ? (
                    <ProteinViewer
                      pdbData={activePdb}
                      highlightResidues={highlightResidues}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                      Select a protein region to view structure
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
        </div>
      )}
    </AppShell>
  );
}
