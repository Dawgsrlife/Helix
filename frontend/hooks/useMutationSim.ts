"use client";

import { useState, useCallback } from "react";
import type { MutationEffect } from "@/types";
import { predictMutation } from "@/lib/api";

interface MutationSimState {
  effect: MutationEffect | null;
  isLoading: boolean;
  error: string | null;
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Mutation simulation failed";
        setState({ effect: null, isLoading: false, error: message });
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ effect: null, isLoading: false, error: null });
  }, []);

  return { ...state, simulate, reset };
}
