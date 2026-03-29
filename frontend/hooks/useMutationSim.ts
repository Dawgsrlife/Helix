"use client";

import { useCallback } from "react";
import { predictMutation, fetchStructure } from "@/lib/api";
import { useHelixStore } from "@/lib/store";
import { parseSequence } from "@/lib/sequenceUtils";

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

        // Actually apply the mutation to the sequence in the store
        const store = useHelixStore.getState();
        const mutated = sequence.slice(0, position) + alternateBase + sequence.slice(position + 1);
        const newBases = parseSequence(mutated, store.regions).map((base, i) => ({
          ...base,
          likelihoodScore: store.scores[i]?.score,
        }));
        store.setSequence(mutated);
        useHelixStore.setState({ bases: newBases });

        // Re-fold protein structure — keep loading state while folding
        try {
          const pdb = await fetchStructure(0, mutated.length, mutated);
          useHelixStore.getState().setActivePdb(pdb);
        } catch {
          // Structure prediction may fail — keep old PDB
        }
      } catch {
        // Mutation prediction failed
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
