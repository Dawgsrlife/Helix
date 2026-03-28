import type { AnalysisResult, MutationEffect } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Maps raw API response to domain AnalysisResult type.
 * This is the only place where API response shapes are known.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnalysisResponse(data: Record<string, any>): AnalysisResult {
  return {
    rawSequence: data.sequence ?? "",
    regions: (data.regions ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: Record<string, any>) => ({
        start: r.start,
        end: r.end,
        type: r.type ?? "unknown",
        label: r.label,
        score: r.score,
      })
    ),
    perPositionScores: (data.scores ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: Record<string, any>) => ({
        position: s.position,
        score: s.score,
      })
    ),
    predictedProteins: (data.proteins ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: Record<string, any>) => ({
        regionStart: p.region_start,
        regionEnd: p.region_end,
        pdbData: p.pdb_data,
        sequenceIdentity: p.sequence_identity,
      })
    ),
  };
}

/** Submit a sequence for analysis via Evo 2 */
export async function analyzeSequence(
  sequence: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence }),
  });

  if (!res.ok) {
    throw new Error(`Analysis failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return mapAnalysisResponse(data);
}

/** Submit a mutation for effect prediction */
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

  if (!res.ok) {
    throw new Error(`Mutation prediction failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    position: data.position,
    referenceBase: data.reference_base,
    alternateBase: data.alternate_base,
    deltaLikelihood: data.delta_likelihood,
    predictedImpact: data.predicted_impact,
  };
}

/** Fetch protein structure prediction from AlphaFold */
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

  if (!res.ok) {
    throw new Error(`Structure prediction failed: ${res.status}`);
  }

  const data = await res.json();
  return data.pdb_data;
}
