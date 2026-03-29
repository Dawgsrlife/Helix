"use client";

import { useCallback } from "react";
import { predictMutation } from "@/lib/api";
import { useHelixStore } from "@/lib/store";

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
        // Hits local Next.js API routes (mock) or real backend via NEXT_PUBLIC_API_URL
        const effect = await predictMutation(sequence, position, alternateBase);
        setMutationEffect(effect);
      } catch {
        // Silently fail for demo, mutation panel stays empty
      } finally {
        setMutationLoading(false);
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
