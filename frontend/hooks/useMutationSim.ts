"use client";

import { useCallback } from "react";
import type { MutationEffect } from "@/types";
import { predictMutation } from "@/lib/api";
import { useHelixStore } from "@/lib/store";

/** Mock mutation for standalone demo when backend is unavailable */
function mockMutationEffect(
  sequence: string,
  position: number,
  alternateBase: string
): MutationEffect {
  const referenceBase = position < sequence.length ? sequence[position] : "N";
  const delta = -(Math.random() * 8 + 0.5) * (Math.random() > 0.3 ? 1 : -0.1);
  const abs = Math.abs(delta);
  const impact: MutationEffect["predictedImpact"] =
    abs < 1 ? "benign" : abs < 3 ? "moderate" : "deleterious";
  return {
    position,
    referenceBase,
    alternateBase,
    deltaLikelihood: Math.round(delta * 100) / 100,
    predictedImpact: impact,
  };
}

export function useMutationSim() {
  const mutationEffect = useHelixStore((s) => s.mutationEffect);
  const mutationLoading = useHelixStore((s) => s.mutationLoading);
  const setMutationEffect = useHelixStore((s) => s.setMutationEffect);
  const setMutationLoading = useHelixStore((s) => s.setMutationLoading);

  const simulate = useCallback(
    async (sequence: string, position: number, alternateBase: string) => {
      setMutationLoading(true);
      setMutationEffect(null);

      try {
        const effect = await predictMutation(sequence, position, alternateBase);
        setMutationEffect(effect);
        setMutationLoading(false);
        return effect;
      } catch {
        // Fall back to mock data for demo
        const mock = mockMutationEffect(sequence, position, alternateBase);
        setMutationEffect(mock);
        setMutationLoading(false);
        return mock;
      }
    },
    [setMutationEffect, setMutationLoading]
  );

  const reset = useCallback(() => {
    setMutationEffect(null);
    setMutationLoading(false);
  }, [setMutationEffect, setMutationLoading]);

  return { effect: mutationEffect, isLoading: mutationLoading, simulate, reset };
}
