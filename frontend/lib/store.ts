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
  perPositionScores?: LikelihoodScore[];
  error?: string | null;
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
  chatDraft: string | null;
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
  setChatOpen: (open: boolean) => void;
  setChatDraft: (draft: string | null) => void;
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
  chatOpen: true,
  chatDraft: null as string | null,
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
    const state = get();
    const regions = result.regions;
    const bases = parseSequence(result.rawSequence, regions).map((base, i) => ({
      ...base,
      likelihoodScore: result.perPositionScores[i]?.score,
    }));

    let candidates = [...state.candidates];
    if (candidates.length === 0) {
      // For direct /api/analyze path (non-pipeline), create one deterministic candidate.
      const meanAbs = result.perPositionScores.length
        ? result.perPositionScores.reduce((sum, row) => sum + Math.abs(row.score), 0) / result.perPositionScores.length
        : 0.5;
      const normalized = Math.max(0, Math.min(1, meanAbs / 2.5));
      const baseCandidate: Candidate = {
        id: 0,
        sequence: result.rawSequence,
        scores: {
          functional: Math.max(0.35, Math.min(0.92, 0.45 + normalized * 0.4)),
          tissue: Math.max(0.2, Math.min(0.9, 0.4 + normalized * 0.3)),
          offTarget: Math.max(0.0, Math.min(0.35, 0.18 - normalized * 0.12)),
          novelty: Math.max(0.2, Math.min(0.9, 0.35 + normalized * 0.35)),
        },
        overall: 0,
        status: "scored",
        perPositionScores: result.perPositionScores,
        error: null,
      };
      baseCandidate.overall =
        (baseCandidate.scores.functional * 0.35 +
          baseCandidate.scores.tissue * 0.3 +
          (1 - baseCandidate.scores.offTarget) * 0.2 +
          baseCandidate.scores.novelty * 0.15) *
        100;
      candidates = [baseCandidate];
    }

    const activeCandidateId = state.activeCandidateId ?? candidates[0]?.id ?? null;

    set({
      analysisResult: result,
      rawSequence: result.rawSequence,
      regions, bases,
      scores: result.perPositionScores,
      pipelineStatus: "complete",
      viewMode: "structure",
      candidates,
      activeCandidateId,
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
  setChatOpen: (open) => set({ chatOpen: open }),
  setChatDraft: (draft) => set({ chatDraft: draft }),
  setCandidates: (candidates) => set({ candidates }),
  setActiveCandidateId: (id) => {
    const state = get();
    const candidate = state.candidates.find((c) => c.id === id);
    if (!candidate) {
      set({ activeCandidateId: id });
      return;
    }
    const regions = state.regions;
    const perPosition = candidate.perPositionScores ?? state.scores;
    const nextBases = parseSequence(candidate.sequence, regions).map((base, i) => ({
      ...base,
      likelihoodScore: perPosition[i]?.score,
    }));
    set({
      activeCandidateId: id,
      rawSequence: candidate.sequence,
      scores: perPosition,
      bases: nextBases,
    });
  },
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
        activePdb: snap.pdb ?? get().originalPdb ?? get().activePdb,
        mutationEffect: null,
        highlightResidues: [],
        selectedPosition: null,
      });
    }
  },
  reset: () => set(initialState),
}));
