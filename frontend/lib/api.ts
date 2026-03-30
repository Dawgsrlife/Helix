/**
 * API client for Helix backend.
 *
 * INTEGRATION GUIDE:
 * - Set NEXT_PUBLIC_API_URL env var to point to the GPU-hosted backend
 *   (e.g., NEXT_PUBLIC_API_URL=http://192.168.1.100:8000)
 * - All functions throw on HTTP errors. Callers (hooks) catch and fall
 *   back to mock data when the backend is unreachable.
 * - Response shapes are mapped to frontend domain types here at the
 *   boundary. Components never see raw API shapes.
 *
 * STUB STATUS:
 * - analyzeSequence:  Calls POST /api/analyze. Backend implemented.
 * - predictMutation:  Calls POST /api/mutations. Backend implemented.
 * - fetchStructure:   Calls POST /api/structure. Backend returns mock PDB.
 * - submitDesign:     Calls POST /api/design. Backend implemented.
 *                     Returns session_id + ws_url for streaming.
 * - editBase:         Calls POST /api/edit/base. Backend implemented.
 * - editFollowup:     Calls POST /api/edit/followup. Backend implemented.
 *
 * When the backend is running on the GX10, just set the env var and
 * all mock fallbacks in the hooks will be bypassed automatically.
 */

import type { AnalysisResult, MutationEffect } from "@/types";

// Default to the real local backend to avoid silently hitting mock Next routes.
// Override with NEXT_PUBLIC_API_URL when backend runs on another machine.
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Response mappers (API shape -> domain type)
// ---------------------------------------------------------------------------

interface ApiAnalysisResponse {
  sequence: string;
  regions: Array<{
    start: number;
    end: number;
    type: string;
    label?: string;
    score?: number;
  }>;
  scores: Array<{ position: number; score: number }>;
  proteins: Array<{
    region_start: number;
    region_end: number;
    pdb_data?: string;
    sequence_identity?: number;
  }>;
}

function mapAnalysisResponse(data: ApiAnalysisResponse): AnalysisResult {
  return {
    rawSequence: data.sequence ?? "",
    regions: (data.regions ?? []).map((r) => ({
      start: r.start,
      end: r.end,
      type: (r.type ?? "unknown") as AnalysisResult["regions"][number]["type"],
      label: r.label,
      score: r.score,
    })),
    perPositionScores: (data.scores ?? []).map((s) => ({
      position: s.position,
      score: s.score,
    })),
    predictedProteins: (data.proteins ?? []).map((p) => ({
      regionStart: p.region_start,
      regionEnd: p.region_end,
      pdbData: p.pdb_data,
      sequenceIdentity: p.sequence_identity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Path A: Non-streaming analysis endpoints (currently used by frontend)
// ---------------------------------------------------------------------------

/** POST /api/analyze - Submit sequence for Evo2 analysis */
export async function analyzeSequence(
  sequence: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  const data = await res.json();
  return mapAnalysisResponse(data);
}

/** POST /api/mutations - Predict mutation effect */
export async function predictMutation(
  sequence: string,
  position: number,
  alternateBase: string
): Promise<MutationEffect> {
  const res = await fetch(`${API_BASE}/api/mutations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence, position, alternate_base: alternateBase }),
  });
  if (!res.ok) throw new Error(`Mutation prediction failed: ${res.status}`);
  const data = await res.json();
  return {
    position: data.position,
    referenceBase: data.reference_base,
    alternateBase: data.alternate_base,
    deltaLikelihood: data.delta_likelihood,
    predictedImpact: data.predicted_impact,
  };
}

/** POST /api/structure - Fetch protein structure prediction */
export async function fetchStructure(
  regionStart: number,
  regionEnd: number,
  sequence: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/structure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sequence,
      region_start: regionStart,
      region_end: regionEnd,
    }),
  });
  if (!res.ok) throw new Error(`Structure prediction failed: ${res.status}`);
  const data = await res.json();
  return data.pdb_data;
}

// ---------------------------------------------------------------------------
// Path B: Streaming design pipeline (backend built, frontend integration TBD)
// ---------------------------------------------------------------------------

export interface DesignSession {
  sessionId: string;
  wsUrl: string;
}

export interface SubmitDesignOptions {
  sessionId?: string;
  numCandidates?: number;
  runProfile?: "demo" | "live";
  truthMode?: "demo_fallback" | "real_only";
}

/** POST /api/design - Start a full design pipeline. Returns WS URL for streaming. */
export async function submitDesign(
  goal: string,
  options: SubmitDesignOptions = {}
): Promise<DesignSession> {
  const {
    sessionId,
    numCandidates = 10,
    runProfile = "demo",
    truthMode = "demo_fallback",
  } = options;
  const res = await fetch(`${API_BASE}/api/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal,
      session_id: sessionId,
      num_candidates: numCandidates,
      run_profile: runProfile,
      truth_mode: truthMode,
    }),
  });
  if (!res.ok) throw new Error(`Design submission failed: ${res.status}`);
  const data = await res.json();
  return { sessionId: data.session_id, wsUrl: data.ws_url };
}

/** POST /api/edit/base - Single base pair edit, re-score only. Must respond < 2s. */
export async function editBase(
  sessionId: string,
  candidateId: number,
  position: number,
  newBase: string
) {
  const res = await fetch(`${API_BASE}/api/edit/base`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      candidate_id: candidateId,
      position,
      new_base: newBase,
    }),
  });
  if (!res.ok) throw new Error(`Base edit failed: ${res.status}`);
  return res.json();
}

/** POST /api/edit/followup - NL follow-up, triggers partial pipeline re-run. */
export async function editFollowup(
  sessionId: string,
  message: string,
  candidateId: number
) {
  const res = await fetch(`${API_BASE}/api/edit/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      candidate_id: candidateId,
    }),
  });
  if (!res.ok) throw new Error(`Followup failed: ${res.status}`);
  return res.json();
}

/** GET /api/health - Check backend status */
export async function checkHealth(): Promise<{
  status: string;
  model: string;
  gpu_available: boolean;
  inference_mode: string;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
