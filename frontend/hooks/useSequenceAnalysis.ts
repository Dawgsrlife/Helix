"use client";

import { useCallback } from "react";
import { analyzeSequence } from "@/lib/api";
import { useHelixStore } from "@/lib/store";

export function useSequenceAnalysis() {
  const pipelineStatus = useHelixStore((s) => s.pipelineStatus);
  const error = useHelixStore((s) => s.error);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const setAnalysisResult = useHelixStore((s) => s.setAnalysisResult);
  const setPipelineStatus = useHelixStore((s) => s.setPipelineStatus);
  const setError = useHelixStore((s) => s.setError);

  const analyze = useCallback(
    async (sequence: string) => {
      setPipelineStatus("analyzing");

      try {
        // Hits local Next.js API routes (mock) or real backend via NEXT_PUBLIC_API_URL
        const result = await analyzeSequence(sequence);
        setAnalysisResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        setError(message);
        return null;
      }
    },
    [setAnalysisResult, setPipelineStatus, setError]
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
