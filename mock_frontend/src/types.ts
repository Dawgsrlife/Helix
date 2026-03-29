export type StageKey =
  | "intent"
  | "retrieval"
  | "generation"
  | "scoring"
  | "structure"
  | "explanation"
  | "complete";

export type StageStatus = "pending" | "active" | "done" | "failed";
export type CandidateStatus = "queued" | "running" | "scored" | "structured" | "failed";

export interface CandidateScores {
  functional: number;
  tissue_specificity: number;
  off_target: number;
  novelty: number;
  combined?: number | null;
}

export interface CandidateState {
  id: number;
  status: CandidateStatus;
  sequence: string;
  scores: CandidateScores | null;
  confidence: number | null;
  pdbData: string;
  error: string | null;
  baseHeat: Record<number, { deltaLikelihood: number; impact: string; updatedAt: number }>;
}

export interface StageState {
  status: StageStatus;
  progress: number;
}

export interface RetrievalState {
  status: "pending" | "running" | "complete" | "failed";
  result: Record<string, unknown> | null;
}

export interface PipelineState {
  apiBase: string;
  sessionId: string;
  wsUrl: string;
  wsStatus: "disconnected" | "connecting" | "connected";
  runProfile: "demo" | "live";
  requestedCandidates: number;
  pipelineStatus: "idle" | "running" | "complete" | "error";
  stages: Record<StageKey, StageState>;
  retrieval: Record<"ncbi" | "pubmed" | "clinvar", RetrievalState>;
  intentSpec: Record<string, unknown>;
  candidates: Record<number, CandidateState>;
  candidateOrder: number[];
  activeCandidateId: number | null;
  explanationByCandidate: Record<number, string>;
  eventLog: string[];
  chat: Array<{ role: "system" | "user" | "assistant"; text: string; at: string }>;
  laymanSummary: string;
  isSubmittingDesign: boolean;
  isSubmittingFollowup: boolean;
  selectedPosition: number | null;
  editFeedback: string;
  autoplayStarted: boolean;
}

export type PipelineEvent =
  | { event: "pipeline_manifest"; data: { session_id: string; requested_candidates: number; candidate_ids: number[]; run_profile: "demo" | "live" } }
  | { event: "stage_status"; data: { stage: StageKey; status: StageStatus; progress: number } }
  | { event: "intent_parsed"; data: { spec: Record<string, unknown> } }
  | { event: "retrieval_progress"; data: { source: "ncbi" | "pubmed" | "clinvar"; status: RetrievalState["status"]; result?: Record<string, unknown> } }
  | { event: "candidate_status"; data: { candidate_id: number; status: CandidateStatus; reason?: string | null } }
  | { event: "generation_token"; data: { candidate_id: number; token: string; position: number } }
  | { event: "candidate_scored"; data: { candidate_id: number; scores: CandidateScores } }
  | { event: "structure_ready"; data: { candidate_id: number; pdb_data: string; confidence?: number | null } }
  | { event: "explanation_chunk"; data: { candidate_id: number; text: string } }
  | {
      event: "pipeline_complete";
      data: {
        requested_candidates: number;
        completed_candidates: number;
        failed_candidates: number;
        candidates: Array<{
          id: number;
          status?: CandidateStatus;
          sequence?: string;
          scores?: CandidateScores | null;
          pdb_data?: string | null;
          confidence?: number | null;
          error?: string | null;
        }>;
      };
    };

export interface DesignAcceptedResponse {
  session_id: string;
  status: string;
  ws_url: string;
}

export interface BaseEditResponse {
  position: number;
  reference_base: string;
  new_base: string;
  delta_likelihood: number;
  predicted_impact: string;
  updated_scores: CandidateScores;
}

export interface FollowupAcceptedResponse {
  status: string;
  steps_rerunning: string[];
}
