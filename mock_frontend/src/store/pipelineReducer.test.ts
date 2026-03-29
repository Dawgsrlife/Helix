import { describe, expect, it } from "vitest";

import { createInitialState, pipelineReducer } from "./pipelineReducer";
import type { PipelineEvent } from "../types";

function reduce(state = createInitialState(), payload: PipelineEvent) {
  return pipelineReducer(state, { type: "PIPELINE_EVENT", payload });
}

describe("pipelineReducer", () => {
  it("hydrates placeholders from pipeline_manifest", () => {
    const next = reduce(undefined, {
      event: "pipeline_manifest",
      data: {
        session_id: "s1",
        requested_candidates: 5,
        candidate_ids: [0, 1, 2, 3, 4],
        run_profile: "demo"
      }
    });

    expect(next.requestedCandidates).toBe(5);
    expect(next.candidateOrder).toEqual([0, 1, 2, 3, 4]);
    expect(Object.keys(next.candidates)).toHaveLength(5);
  });

  it("applies generation tokens deterministically", () => {
    const withManifest = reduce(undefined, {
      event: "pipeline_manifest",
      data: {
        session_id: "s1",
        requested_candidates: 1,
        candidate_ids: [0],
        run_profile: "demo"
      }
    });
    const tokenA = pipelineReducer(withManifest, {
      type: "PIPELINE_EVENT",
      payload: { event: "generation_token", data: { candidate_id: 0, token: "A", position: 0 } }
    });
    const tokenT = pipelineReducer(tokenA, {
      type: "PIPELINE_EVENT",
      payload: { event: "generation_token", data: { candidate_id: 0, token: "T", position: 1 } }
    });

    expect(tokenT.candidates[0].sequence).toBe("AT");
  });

  it("uses stage_status as source of truth for stage state", () => {
    const next = reduce(undefined, {
      event: "stage_status",
      data: { stage: "explanation", status: "active", progress: 0.5 }
    });

    expect(next.stages.explanation.status).toBe("active");
    expect(next.stages.explanation.progress).toBe(0.5);
  });

  it("keeps candidate outcomes on pipeline_complete", () => {
    const withManifest = reduce(undefined, {
      event: "pipeline_manifest",
      data: {
        session_id: "s2",
        requested_candidates: 2,
        candidate_ids: [0, 1],
        run_profile: "demo"
      }
    });
    const done = pipelineReducer(withManifest, {
      type: "PIPELINE_EVENT",
      payload: {
        event: "pipeline_complete",
        data: {
          requested_candidates: 2,
          completed_candidates: 1,
          failed_candidates: 1,
          candidates: [
            { id: 0, status: "structured", sequence: "ATCG", scores: { functional: 0.8, tissue_specificity: 0.6, off_target: 0.1, novelty: 0.4, combined: 0.7 } },
            { id: 1, status: "failed", sequence: "", error: "generation_timeout" }
          ]
        }
      }
    });

    expect(done.pipelineStatus).toBe("complete");
    expect(done.candidates[0].status).toBe("structured");
    expect(done.candidates[1].status).toBe("failed");
    expect(done.candidates[1].error).toBe("generation_timeout");
  });
});
