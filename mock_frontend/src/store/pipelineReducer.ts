import type {
  CandidateState,
  PipelineEvent,
  PipelineState,
  StageKey,
  StageStatus,
  CandidateScores,
  BaseEditResponse
} from "../types";

export const STAGE_KEYS: StageKey[] = [
  "intent",
  "retrieval",
  "generation",
  "scoring",
  "structure",
  "explanation",
  "complete"
];

const RETRIEVAL_SOURCES = ["ncbi", "pubmed", "clinvar"] as const;

export type PipelineAction =
  | { type: "INIT_DESIGN_SUBMIT"; apiBase: string; requestedCandidates: number }
  | { type: "DESIGN_ACCEPTED"; sessionId: string; wsUrl: string; runProfile: "demo" | "live"; goal: string }
  | { type: "PIPELINE_EVENT"; payload: PipelineEvent }
  | { type: "WS_STATUS"; status: PipelineState["wsStatus"] }
  | { type: "SELECT_CANDIDATE"; candidateId: number }
  | { type: "SELECT_POSITION"; position: number | null }
  | { type: "BASE_EDIT_APPLIED"; candidateId: number; response: BaseEditResponse; elapsedMs: number }
  | { type: "BASE_EDIT_ERROR"; message: string }
  | { type: "FOLLOWUP_PENDING"; message: string }
  | { type: "FOLLOWUP_ACCEPTED"; message: string; steps: string[] }
  | { type: "RESET" };

function nowTag(): string {
  return new Date().toLocaleTimeString();
}

function makeStageState(status: StageStatus = "pending", progress = 0): { status: StageStatus; progress: number } {
  return { status, progress };
}

function emptyCandidate(id: number): CandidateState {
  return {
    id,
    status: "queued",
    sequence: "",
    streamOffset: null,
    scores: null,
    confidence: null,
    pdbData: "",
    error: null,
    baseHeat: {}
  };
}

function ensureCandidate(state: PipelineState, candidateId: number): CandidateState {
  const existing = state.candidates[candidateId];
  if (existing) {
    return existing;
  }
  const fresh = emptyCandidate(candidateId);
  state.candidates[candidateId] = fresh;
  if (!state.candidateOrder.includes(candidateId)) {
    state.candidateOrder.push(candidateId);
    state.candidateOrder.sort((a, b) => a - b);
  }
  return fresh;
}

function rankScore(scores: CandidateScores | null): number {
  if (!scores) {
    return -Infinity;
  }
  if (typeof scores.combined === "number") {
    return scores.combined;
  }
  return scores.functional;
}

function verdict(score: number | null | undefined, invert = false): string {
  if (score === null || score === undefined) {
    return "Unknown";
  }
  const value = invert ? 1 - Number(score) : Number(score);
  if (value >= 0.75) return "Strong";
  if (value >= 0.55) return "Promising";
  if (value >= 0.40) return "Weak";
  return "Poor";
}

function recomputeLaymanSummary(state: PipelineState): PipelineState {
  const topCandidate = Object.values(state.candidates)
    .sort((a, b) => rankScore(b.scores) - rankScore(a.scores))[0];

  if (!topCandidate || !topCandidate.scores) {
    state.laymanSummary = "Helix is warming up. Live candidates will animate in shortly.";
    return state;
  }

  state.laymanSummary =
    `Top candidate #${topCandidate.id} | likely-to-work: ${verdict(topCandidate.scores.functional)} | ` +
    `tissue-fit: ${verdict(topCandidate.scores.tissue_specificity)} | safety: ${verdict(topCandidate.scores.off_target, true)}`;
  return state;
}

function pushEvent(state: PipelineState, text: string): void {
  state.eventLog.unshift(`[${nowTag()}] ${text}`);
  if (state.eventLog.length > 160) {
    state.eventLog.length = 160;
  }
}

export function createInitialState(apiBase = "http://localhost:8000"): PipelineState {
  return {
    apiBase,
    sessionId: "",
    wsUrl: "",
    wsStatus: "disconnected",
    runProfile: "demo",
    requestedCandidates: 10,
    pipelineStatus: "idle",
    stages: {
      intent: makeStageState(),
      retrieval: makeStageState(),
      generation: makeStageState(),
      scoring: makeStageState(),
      structure: makeStageState(),
      explanation: makeStageState(),
      complete: makeStageState()
    },
    retrieval: {
      ncbi: { status: "pending", result: null },
      pubmed: { status: "pending", result: null },
      clinvar: { status: "pending", result: null }
    },
    intentSpec: {},
    candidates: {},
    candidateOrder: [],
    activeCandidateId: null,
    explanationByCandidate: {},
    eventLog: [],
    chat: [],
    laymanSummary: "Enter a design goal to generate ranked DNA candidates.",
    isSubmittingDesign: false,
    isSubmittingFollowup: false,
    selectedPosition: null,
    editFeedback: ""
  };
}

function applyPipelineEvent(baseState: PipelineState, payload: PipelineEvent): PipelineState {
  const state = structuredClone(baseState);

  switch (payload.event) {
    case "pipeline_manifest": {
      state.sessionId = payload.data.session_id;
      state.requestedCandidates = payload.data.requested_candidates;
      state.runProfile = payload.data.run_profile;
      state.pipelineStatus = "running";
      state.candidateOrder = [...payload.data.candidate_ids];
      for (const candidateId of payload.data.candidate_ids) {
        const candidate = ensureCandidate(state, candidateId);
        candidate.status = "queued";
        const seeded = payload.data.candidate_seed_sequences?.[String(candidateId)] ?? "";
        candidate.sequence = seeded;
        candidate.streamOffset = null;
      }
      if (state.activeCandidateId === null && payload.data.candidate_ids.length > 0) {
        state.activeCandidateId = payload.data.candidate_ids[0];
      }
      pushEvent(state, `manifest received (${payload.data.requested_candidates} candidates)`);
      break;
    }

    case "stage_status": {
      state.stages[payload.data.stage] = {
        status: payload.data.status,
        progress: payload.data.progress
      };
      if (payload.data.stage === "complete" && payload.data.status === "done") {
        state.pipelineStatus = "complete";
      }
      break;
    }

    case "intent_parsed": {
      state.intentSpec = payload.data.spec;
      pushEvent(state, "intent parsed");
      break;
    }

    case "retrieval_progress": {
      state.retrieval[payload.data.source] = {
        status: payload.data.status,
        result: payload.data.result ?? null
      };
      pushEvent(state, `${payload.data.source} ${payload.data.status}`);
      break;
    }

    case "candidate_status": {
      const candidate = ensureCandidate(state, payload.data.candidate_id);
      candidate.status = payload.data.status;
      if (payload.data.reason) {
        candidate.error = payload.data.reason;
      }
      pushEvent(state, `candidate #${payload.data.candidate_id} ${payload.data.status}`);
      break;
    }

    case "generation_token": {
      const candidate = ensureCandidate(state, payload.data.candidate_id);
      const sequence = candidate.sequence;
      const { token, position } = payload.data;
      if (candidate.streamOffset === null && sequence.length === 0 && position > 0) {
        candidate.streamOffset = position;
      }
      const normalizedPosition =
        candidate.streamOffset === null ? position : Math.max(0, position - candidate.streamOffset);
      if (normalizedPosition === sequence.length) {
        candidate.sequence += token;
      } else if (normalizedPosition < sequence.length) {
        candidate.sequence =
          sequence.slice(0, normalizedPosition) + token + sequence.slice(normalizedPosition + 1);
      } else {
        // Fill unexpected gaps with "N" instead of dropping streamed tokens.
        candidate.sequence = sequence + "N".repeat(normalizedPosition - sequence.length) + token;
      }
      candidate.status = candidate.status === "queued" ? "running" : candidate.status;
      break;
    }

    case "candidate_scored": {
      const candidate = ensureCandidate(state, payload.data.candidate_id);
      candidate.scores = payload.data.scores;
      if (candidate.status !== "failed") {
        candidate.status = "scored";
      }
      break;
    }

    case "structure_ready": {
      const candidate = ensureCandidate(state, payload.data.candidate_id);
      candidate.pdbData = payload.data.pdb_data;
      candidate.confidence = payload.data.confidence ?? null;
      if (candidate.status !== "failed") {
        candidate.status = "structured";
      }
      break;
    }

    case "explanation_chunk": {
      const text = state.explanationByCandidate[payload.data.candidate_id] ?? "";
      state.explanationByCandidate[payload.data.candidate_id] = `${text}${payload.data.text}`;
      break;
    }

    case "pipeline_complete": {
      state.pipelineStatus = "complete";
      state.requestedCandidates = payload.data.requested_candidates;
      for (const candidatePayload of payload.data.candidates) {
        const candidate = ensureCandidate(state, candidatePayload.id);
        if (candidatePayload.status) candidate.status = candidatePayload.status;
        if (candidatePayload.sequence) candidate.sequence = candidatePayload.sequence;
        candidate.streamOffset = null;
        if (candidatePayload.scores) candidate.scores = candidatePayload.scores;
        if (typeof candidatePayload.pdb_data === "string") candidate.pdbData = candidatePayload.pdb_data;
        if (typeof candidatePayload.confidence === "number") candidate.confidence = candidatePayload.confidence;
        if (candidatePayload.error) candidate.error = candidatePayload.error;
      }
      pushEvent(
        state,
        `pipeline complete (${payload.data.completed_candidates}/${payload.data.requested_candidates} ready)`
      );
      break;
    }
  }

  return recomputeLaymanSummary(state);
}

export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "INIT_DESIGN_SUBMIT": {
      const next = createInitialState(action.apiBase);
      next.requestedCandidates = action.requestedCandidates;
      next.pipelineStatus = "running";
      next.isSubmittingDesign = true;
      next.chat.push({ role: "system", text: "Design run started.", at: nowTag() });
      return next;
    }

    case "DESIGN_ACCEPTED": {
      const next = structuredClone(state);
      next.sessionId = action.sessionId;
      next.wsUrl = action.wsUrl;
      next.runProfile = action.runProfile;
      next.isSubmittingDesign = false;
      next.chat.push({ role: "user", text: action.goal, at: nowTag() });
      pushEvent(next, `POST /api/design accepted (${action.sessionId})`);
      return next;
    }

    case "PIPELINE_EVENT":
      return applyPipelineEvent(state, action.payload);

    case "WS_STATUS": {
      const next = structuredClone(state);
      next.wsStatus = action.status;
      return next;
    }

    case "SELECT_CANDIDATE": {
      const next = structuredClone(state);
      next.activeCandidateId = action.candidateId;
      next.selectedPosition = null;
      return next;
    }

    case "SELECT_POSITION": {
      const next = structuredClone(state);
      next.selectedPosition = action.position;
      return next;
    }

    case "BASE_EDIT_APPLIED": {
      const next = structuredClone(state);
      const candidate = ensureCandidate(next, action.candidateId);
      const { response } = action;
      const pos =
        candidate.streamOffset === null
          ? response.position
          : Math.max(0, response.position - candidate.streamOffset);
      candidate.sequence =
        candidate.sequence.slice(0, pos) + response.new_base + candidate.sequence.slice(pos + 1);
      candidate.scores = response.updated_scores;
      candidate.baseHeat[pos] = {
        deltaLikelihood: response.delta_likelihood,
        impact: response.predicted_impact,
        updatedAt: Date.now()
      };
      next.editFeedback = `Base ${pos} -> ${response.new_base} in ${Math.round(action.elapsedMs)} ms`;
      pushEvent(next, `base edit applied (${Math.round(action.elapsedMs)} ms)`);
      return recomputeLaymanSummary(next);
    }

    case "BASE_EDIT_ERROR": {
      const next = structuredClone(state);
      next.isSubmittingDesign = false;
      next.isSubmittingFollowup = false;
      if (next.pipelineStatus === "running" && !next.sessionId) {
        next.pipelineStatus = "error";
      }
      next.editFeedback = action.message;
      pushEvent(next, action.message);
      return next;
    }

    case "FOLLOWUP_PENDING": {
      const next = structuredClone(state);
      next.isSubmittingFollowup = true;
      next.pipelineStatus = "running";
      next.chat.push({ role: "user", text: action.message, at: nowTag() });
      return next;
    }

    case "FOLLOWUP_ACCEPTED": {
      const next = structuredClone(state);
      next.isSubmittingFollowup = false;
      next.chat.push({ role: "system", text: `Follow-up accepted: ${action.steps.join(", ")}`, at: nowTag() });
      pushEvent(next, `follow-up accepted (${action.steps.join(", ")})`);
      return next;
    }

    case "RESET":
      return createInitialState(state.apiBase);

    default:
      return state;
  }
}
