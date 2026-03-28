"use client";

import { useState, useCallback } from "react";
import type { MutationEffect } from "@/types";
import { predictMutation } from "@/lib/api";

interface MutationSimState {
  effect: MutationEffect | null;
  isLoading: boolean;
  error: string | null;
}

/** Mock mutation for standalone demo when backend is unavailable */
function mockMutationEffect(
  sequence: string,
  position: number,
  alternateBase: string
): MutationEffect {
  const referenceBase = position < sequence.length ? sequence[position] : "N";
  const delta = -(Math.random() * 8 + 0.5) * (Math.random() > 0.3 ? 1 : -0.1);
  const abs = Math.abs(delta);
  const impact =
    abs < 1 ? "benign" : abs < 3 ? "moderate" : "deleterious";
  return {
    position,
    referenceBase,
    alternateBase,
    deltaLikelihood: Math.round(delta * 100) / 100,
    predictedImpact: impact as MutationEffect["predictedImpact"],
  };
}

export function useMutationSim() {
  const [state, setState] = useState<MutationSimState>({
    effect: null,
    isLoading: false,
    error: null,
  });

  const simulate = useCallback(
    async (sequence: string, position: number, alternateBase: string) => {
      setState({ effect: null, isLoading: true, error: null });

      try {
        const effect = await predictMutation(sequence, position, alternateBase);
        setState({ effect, isLoading: false, error: null });
        return effect;
      } catch {
        // Fall back to mock data for demo
        const mock = mockMutationEffect(sequence, position, alternateBase);
        setState({ effect: mock, isLoading: false, error: null });
        return mock;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ effect: null, isLoading: false, error: null });
  }, []);

  return { ...state, simulate, reset };
}
