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

/**
 * Product view states within /analyze:
 * - input: paste a sequence (empty state)
 * - analyze: candidate overview, scores, regions (understand)
 * - explorer: sequence inspection, annotations, mutation sim (inspect)
 * - ide: full editing environment with diffs and re-scoring (manipulate)
 */
type ViewMode = "input" | "analyze" | "explorer" | "ide";

interface HelixState {
  // View
  viewMode: ViewMode;

  // Pipeline
  pipelineStatus: PipelineStatus;
  error: string | null;

  // Sequence data
  rawSequence: string;
  bases: Base[];
  regions: SequenceRegion[];
  scores: LikelihoodScore[];

  // Analysis result
  analysisResult: AnalysisResult | null;

  // Interaction
  selectedPosition: number | null;
  selectedRegionIndex: number | null;
  activePdb: string | null;
  highlightResidues: number[];

  // Mutation
  mutationEffect: MutationEffect | null;
  mutationLoading: boolean;

  // Edit history (for IDE)
  editHistory: Array<{ position: number; from: string; to: string; delta: number; timestamp: number }>;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSequence: (seq: string) => void;
  setAnalysisResult: (result: AnalysisResult) => void;
  setSelectedPosition: (pos: number | null) => void;
  setSelectedRegionIndex: (idx: number | null) => void;
  setActivePdb: (pdb: string | null) => void;
  setHighlightResidues: (residues: number[]) => void;
  setMutationEffect: (effect: MutationEffect | null) => void;
  setMutationLoading: (loading: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setError: (error: string | null) => void;
  addEditHistoryEntry: (entry: { position: number; from: string; to: string; delta: number }) => void;
  reset: () => void;
}

const initialState = {
  viewMode: "input" as ViewMode,
  pipelineStatus: "idle" as PipelineStatus,
  error: null,
  rawSequence: "",
  bases: [] as Base[],
  regions: [] as SequenceRegion[],
  scores: [] as LikelihoodScore[],
  analysisResult: null as AnalysisResult | null,
  selectedPosition: null as number | null,
  selectedRegionIndex: null as number | null,
  activePdb: null as string | null,
  highlightResidues: [] as number[],
  mutationEffect: null as MutationEffect | null,
  mutationLoading: false,
  editHistory: [] as HelixState["editHistory"],
};

export const useHelixStore = create<HelixState>((set, get) => ({
  ...initialState,

  setViewMode: (mode) => set({ viewMode: mode }),

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
      viewMode: "analyze",
      error: null,
    });
  },

  setSelectedPosition: (pos) => set({ selectedPosition: pos }),
  setSelectedRegionIndex: (idx) => set({ selectedRegionIndex: idx }),
  setActivePdb: (pdb) => set({ activePdb: pdb }),
  setHighlightResidues: (residues) => set({ highlightResidues: residues }),
  setMutationEffect: (effect) => set({ mutationEffect: effect }),
  setMutationLoading: (loading) => set({ mutationLoading: loading }),
  setPipelineStatus: (status) => set({ pipelineStatus: status }),
  setError: (error) => set({ error, pipelineStatus: "error" }),

  addEditHistoryEntry: (entry) =>
    set({ editHistory: [...get().editHistory, { ...entry, timestamp: Date.now() }] }),

  reset: () => set(initialState),
}));
