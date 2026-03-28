import { create } from "zustand";
import type {
  AnalysisResult,
  MutationEffect,
  LikelihoodScore,
  SequenceRegion,
  Base,
} from "@/types";
import { parseSequence } from "@/lib/sequenceUtils";

type PipelineStatus = "idle" | "input" | "analyzing" | "complete" | "error";

interface HelixState {
  // Pipeline
  pipelineStatus: PipelineStatus;
  error: string | null;

  // Sequence data
  rawSequence: string;
  bases: Base[];
  regions: SequenceRegion[];
  scores: LikelihoodScore[];

  // Analysis result (raw from API/mock)
  analysisResult: AnalysisResult | null;

  // Interaction state
  selectedPosition: number | null;
  activePdb: string | null;
  highlightResidues: number[];

  // Mutation
  mutationEffect: MutationEffect | null;
  mutationLoading: boolean;

  // Actions
  setSequence: (seq: string) => void;
  setAnalysisResult: (result: AnalysisResult) => void;
  setSelectedPosition: (pos: number | null) => void;
  setActivePdb: (pdb: string | null) => void;
  setHighlightResidues: (residues: number[]) => void;
  setMutationEffect: (effect: MutationEffect | null) => void;
  setMutationLoading: (loading: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  pipelineStatus: "idle" as PipelineStatus,
  error: null,
  rawSequence: "",
  bases: [],
  regions: [],
  scores: [],
  analysisResult: null,
  selectedPosition: null,
  activePdb: null,
  highlightResidues: [],
  mutationEffect: null,
  mutationLoading: false,
};

export const useHelixStore = create<HelixState>((set) => ({
  ...initialState,

  setSequence: (seq) => set({ rawSequence: seq }),

  setAnalysisResult: (result) => {
    const regions = result.regions;
    const bases = parseSequence(result.rawSequence, regions).map((base, i) => ({
      ...base,
      likelihoodScore: result.perPositionScores[i]?.score,
    }));
    set({
      analysisResult: result,
      rawSequence: result.rawSequence,
      regions,
      bases,
      scores: result.perPositionScores,
      pipelineStatus: "complete",
      error: null,
    });
  },

  setSelectedPosition: (pos) => set({ selectedPosition: pos }),
  setActivePdb: (pdb) => set({ activePdb: pdb }),
  setHighlightResidues: (residues) => set({ highlightResidues: residues }),
  setMutationEffect: (effect) => set({ mutationEffect: effect }),
  setMutationLoading: (loading) => set({ mutationLoading: loading }),
  setPipelineStatus: (status) => set({ pipelineStatus: status }),
  setError: (error) => set({ error, pipelineStatus: "error" }),
  reset: () => set(initialState),
}));
