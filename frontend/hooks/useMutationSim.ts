"use client";

import { useCallback } from "react";
import { editBase, fetchStructure, predictMutation } from "@/lib/api";
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
        const store = useHelixStore.getState();
        store.saveVersion();

        let effect;
        if (store.sessionId && store.activeCandidateId !== null) {
          const response = await editBase(store.sessionId, store.activeCandidateId, position, alternateBase);
          effect = {
            position: response.position,
            referenceBase: response.reference_base,
            alternateBase: response.new_base,
            deltaLikelihood: response.delta_likelihood,
            predictedImpact: response.predicted_impact,
          };
          const candidates = [...store.candidates];
          const idx = candidates.findIndex((c) => c.id === store.activeCandidateId);
          if (idx >= 0) {
            const functional = Number(response.updated_scores.functional ?? candidates[idx].scores.functional);
            const tissue = Number(response.updated_scores.tissue_specificity ?? candidates[idx].scores.tissue);
            const offTarget = Number(response.updated_scores.off_target ?? candidates[idx].scores.offTarget);
            const novelty = Number(response.updated_scores.novelty ?? candidates[idx].scores.novelty);
            candidates[idx] = {
              ...candidates[idx],
              scores: { functional, tissue, offTarget, novelty },
              overall:
                (functional * 0.35 + tissue * 0.3 + (1 - offTarget) * 0.2 + novelty * 0.15) *
                100,
              sequence:
                sequence.slice(0, position) + alternateBase + sequence.slice(position + 1),
            };
            candidates.sort((a, b) => b.overall - a.overall);
            store.setCandidates(candidates);
          }
        } else {
          effect = await predictMutation(sequence, position, alternateBase);
        }

        setMutationEffect(effect);

        // Actually apply the mutation to the sequence in the store
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
