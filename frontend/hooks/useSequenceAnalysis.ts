"use client";

import { useState, useCallback } from "react";
import type { AnalysisResult } from "@/types";
import { analyzeSequence } from "@/lib/api";

interface SequenceAnalysisState {
  result: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useSequenceAnalysis() {
  const [state, setState] = useState<SequenceAnalysisState>({
    result: null,
    isLoading: false,
    error: null,
  });

  const analyze = useCallback(async (sequence: string) => {
    setState({ result: null, isLoading: true, error: null });

    try {
      const result = await analyzeSequence(sequence);
      setState({ result, isLoading: false, error: null });
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Analysis failed";
      setState({ result: null, isLoading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ result: null, isLoading: false, error: null });
  }, []);

  return { ...state, analyze, reset };
}
