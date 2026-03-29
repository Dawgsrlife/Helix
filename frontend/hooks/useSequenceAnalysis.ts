"use client";

import { useCallback } from "react";
import { analyzeSequence, submitDesign } from "@/lib/api";
import { useHelixStore } from "@/lib/store";

const MIN_PIPELINE_DURATION = 6200; // ms — let the animation play out

export function useSequenceAnalysis() {
  const pipelineStatus = useHelixStore((s) => s.pipelineStatus);
  const error = useHelixStore((s) => s.error);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const setAnalysisResult = useHelixStore((s) => s.setAnalysisResult);
  const setPipelineStatus = useHelixStore((s) => s.setPipelineStatus);
  const setViewMode = useHelixStore((s) => s.setViewMode);
  const setError = useHelixStore((s) => s.setError);

  const analyze = useCallback(
    async (sequence: string) => {
      setViewMode("pipeline");
      setPipelineStatus("analyzing");

      const startTime = Date.now();

      try {
        // Hits local Next.js API routes (mock) or real backend via NEXT_PUBLIC_API_URL
        const result = await analyzeSequence(sequence);

        // Let the pipeline animation play for a satisfying duration
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_PIPELINE_DURATION) {
          await new Promise((r) => setTimeout(r, MIN_PIPELINE_DURATION - elapsed));
        }

        setAnalysisResult(result);

        // Create a backend session so Helio agent chat works
        try {
          const { sessionId } = await submitDesign(`Analyze sequence: ${sequence.slice(0, 50)}...`);
          useHelixStore.getState().setSessionId(sessionId);
        } catch {
          // Session creation is optional — Helio falls back to local responses
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        setError(message);
        return null;
      }
    },
    [setAnalysisResult, setPipelineStatus, setViewMode, setError]
  );

  const reset = useCallback(() => {
    useHelixStore.getState().reset();
  }, []);

  return {
    result: analysisResult,
    isLoading: pipelineStatus === "analyzing",
    error,
    analyze,
    reset,
  };
}
