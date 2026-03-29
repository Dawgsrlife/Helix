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
 * - input: paste a sequence
 * - pipeline: analysis running, live streaming
 * - analyze: candidate overview (understand)
 * - structure: 3D protein structure centerpiece
 * - leaderboard: candidate ranking/triage
 * - explorer: sequence inspection (inspect)
 * - ide: full editing (manipulate)
 * - compare: diff/compare view
 */
type ViewMode = "input" | "pipeline" | "analyze" | "structure" | "leaderboard" | "explorer" | "ide" | "compare";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface EditEntry {
  position: number;
  from: string;
  to: string;
  delta: number;
  timestamp: number;
}

interface Candidate {
  id: number;
  sequence: string;
  scores: { functional: number; tissue: number; offTarget: number; novelty: number };
  overall: number;
  status: string;
}

interface RetrievalStatus {
  source: string;
  status: "pending" | "running" | "complete" | "failed";
}

interface HelixState {
  viewMode: ViewMode;
  pipelineStatus: PipelineStatus;
  pipelineStage: string;
  error: string | null;

  rawSequence: string;
  bases: Base[];
  regions: SequenceRegion[];
  scores: LikelihoodScore[];
  analysisResult: AnalysisResult | null;

  selectedPosition: number | null;
  selectedRegionIndex: number | null;
  activePdb: string | null;
  originalPdb: string | null;
  highlightResidues: number[];

  mutationEffect: MutationEffect | null;
  mutationLoading: boolean;

  editHistory: EditEntry[];
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  candidates: Candidate[];
  activeCandidateId: number | null;

  // Streaming pipeline state
  sessionId: string | null;
  generatingSequence: string;
  explanation: string;
  retrievalStatuses: RetrievalStatus[];
  generationTokenCount: number;
  completedStages: string[];

  // Connection
  wsStatus: "disconnected" | "connecting" | "connected";
  setWsStatus: (status: "disconnected" | "connecting" | "connected") => void;

  // Theme
  theme: "dark" | "light";
  toggleTheme: () => void;

  // Auth (mock)
  user: { id: string; name: string; email: string } | null;
  signIn: () => void;
  signOut: () => void;

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
  setPipelineStage: (stage: string) => void;
  setError: (error: string | null) => void;
  addEditEntry: (entry: Omit<EditEntry, "timestamp">) => void;
  addChatMessage: (msg: Omit<ChatMessage, "timestamp">) => void;
  toggleChat: () => void;
  setCandidates: (candidates: Candidate[]) => void;
  setActiveCandidateId: (id: number | null) => void;
  setSessionId: (id: string | null) => void;
  appendGeneratingToken: (token: string) => void;
  appendExplanation: (text: string) => void;
  setRetrievalStatuses: (statuses: RetrievalStatus[]) => void;
  updateRetrievalStatus: (source: string, status: RetrievalStatus["status"]) => void;
  addCompletedStage: (stage: string) => void;
  savedSnapshot: { sequence: string; editHistory: EditEntry[]; pdb?: string | null } | null;
  saveVersion: () => void;
  revertVersion: () => void;
  reset: () => void;
}

const initialState = {
  viewMode: "input" as ViewMode,
  pipelineStatus: "idle" as PipelineStatus,
  pipelineStage: "",
  error: null as string | null,
  rawSequence: "",
  bases: [] as Base[],
  regions: [] as SequenceRegion[],
  scores: [] as LikelihoodScore[],
  analysisResult: null as AnalysisResult | null,
  selectedPosition: null as number | null,
  selectedRegionIndex: null as number | null,
  activePdb: null as string | null,
  originalPdb: null as string | null,
  highlightResidues: [] as number[],
  mutationEffect: null as MutationEffect | null,
  mutationLoading: false,
  editHistory: [] as EditEntry[],
  chatMessages: [] as ChatMessage[],
  chatOpen: false,
  candidates: [] as Candidate[],
  activeCandidateId: null as number | null,
  sessionId: null as string | null,
  generatingSequence: "",
  explanation: "",
  retrievalStatuses: [] as RetrievalStatus[],
  generationTokenCount: 0,
  completedStages: [] as string[],
  wsStatus: "disconnected" as "disconnected" | "connecting" | "connected",
  theme: "dark" as "dark" | "light",
  savedSnapshot: null as { sequence: string; editHistory: EditEntry[]; pdb?: string | null } | null,
  user: null as { id: string; name: string; email: string } | null,
};

export const useHelixStore = create<HelixState>((set, get) => ({
  ...initialState,

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    set({ theme: next });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", next === "light");
      document.documentElement.classList.toggle("dark", next === "dark");
    }
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setSequence: (seq) => set({ rawSequence: seq }),

  setAnalysisResult: (result) => {
    const regions = result.regions;
    const bases = parseSequence(result.rawSequence, regions).map((base, i) => ({
      ...base,
      likelihoodScore: result.perPositionScores[i]?.score,
    }));
    // Generate mock candidates from analysis
    const candidates: Candidate[] = [{
      id: 0,
      sequence: result.rawSequence,
      scores: {
        functional: 0.85 + Math.random() * 0.12,
        tissue: 0.70 + Math.random() * 0.20,
        offTarget: Math.random() * 0.05,
        novelty: 0.50 + Math.random() * 0.30,
      },
      overall: 0,
      status: "scored",
    }];
    candidates[0].overall = (candidates[0].scores.functional * 0.35 + candidates[0].scores.tissue * 0.30 + (1 - candidates[0].scores.offTarget) * 0.20 + candidates[0].scores.novelty * 0.15) * 100;

    // Add 2-3 more mock candidates
    for (let i = 1; i <= 3; i++) {
      const c: Candidate = {
        id: i,
        sequence: result.rawSequence,
        scores: {
          functional: 0.60 + Math.random() * 0.30,
          tissue: 0.50 + Math.random() * 0.35,
          offTarget: Math.random() * 0.08,
          novelty: 0.40 + Math.random() * 0.40,
        },
        overall: 0,
        status: "scored",
      };
      c.overall = (c.scores.functional * 0.35 + c.scores.tissue * 0.30 + (1 - c.scores.offTarget) * 0.20 + c.scores.novelty * 0.15) * 100;
      candidates.push(c);
    }
    candidates.sort((a, b) => b.overall - a.overall);

    set({
      analysisResult: result,
      rawSequence: result.rawSequence,
      regions, bases,
      scores: result.perPositionScores,
      pipelineStatus: "complete",
      viewMode: "analyze",
      candidates,
      activeCandidateId: candidates[0].id,
      error: null,
    });
  },

  setSelectedPosition: (pos) => set({ selectedPosition: pos }),
  setSelectedRegionIndex: (idx) => set({ selectedRegionIndex: idx }),
  setActivePdb: (pdb) => {
    const state = get();
    // Save the first PDB as the original for comparison
    if (!state.originalPdb && pdb) {
      set({ activePdb: pdb, originalPdb: pdb });
    } else {
      set({ activePdb: pdb });
    }
  },
  setHighlightResidues: (residues) => set({ highlightResidues: residues }),
  setMutationEffect: (effect) => set({ mutationEffect: effect }),
  setMutationLoading: (loading) => set({ mutationLoading: loading }),
  setPipelineStatus: (status) => set({ pipelineStatus: status }),
  setPipelineStage: (stage) => set({ pipelineStage: stage }),
  setError: (error) => set({ error, pipelineStatus: "error" }),
  addEditEntry: (entry) => set({ editHistory: [...get().editHistory, { ...entry, timestamp: Date.now() }] }),
  addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, { ...msg, timestamp: Date.now() }] }),
  toggleChat: () => set({ chatOpen: !get().chatOpen }),
  setCandidates: (candidates) => set({ candidates }),
  setActiveCandidateId: (id) => set({ activeCandidateId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  setWsStatus: (status) => set({ wsStatus: status }),
  appendGeneratingToken: (token) => set((s) => ({
    generatingSequence: s.generatingSequence + token,
    generationTokenCount: s.generationTokenCount + 1,
  })),
  appendExplanation: (text) => set((s) => ({ explanation: s.explanation + text })),
  setRetrievalStatuses: (statuses) => set({ retrievalStatuses: statuses }),
  updateRetrievalStatus: (source, status) => set((s) => ({
    retrievalStatuses: s.retrievalStatuses.map((r) =>
      r.source === source ? { ...r, status } : r
    ),
  })),
  addCompletedStage: (stage) => set((s) => ({
    completedStages: s.completedStages.includes(stage) ? s.completedStages : [...s.completedStages, stage],
  })),
  signIn: () => set({ user: { id: "user_1", name: "Demo User", email: "demo@helix.bio" } }),
  signOut: () => set({ user: null }),
  saveVersion: () => set((s) => ({
    savedSnapshot: { sequence: s.rawSequence, editHistory: [...s.editHistory], pdb: s.activePdb },
  })),
  revertVersion: () => {
    const snap = get().savedSnapshot;
    if (snap) {
      const regions = get().regions;
      const scores = get().scores;
      const newBases = parseSequence(snap.sequence, regions).map((b, i) => ({
        ...b,
        likelihoodScore: scores[i]?.score,
      }));
      set({
        rawSequence: snap.sequence,
        bases: newBases,
        editHistory: snap.editHistory,
        activePdb: snap.pdb ?? get().activePdb,
        mutationEffect: null,
      });
    }
  },
  reset: () => set(initialState),
}));
