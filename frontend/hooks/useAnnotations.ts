"use client";

import { useMemo } from "react";
import type { AnalysisResult, SequenceRegion, Base } from "@/types";
import { parseSequence } from "@/lib/sequenceUtils";

export function useAnnotations(result: AnalysisResult | null) {
  const regions: SequenceRegion[] = useMemo(
    () => result?.regions ?? [],
    [result]
  );

  const bases: Base[] = useMemo(() => {
    if (!result) return [];
    return parseSequence(result.rawSequence, regions).map((base, i) => ({
      ...base,
      likelihoodScore: result.perPositionScores[i]?.score,
    }));
  }, [result, regions]);

  const annotationSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    for (const region of regions) {
      const len = region.end - region.start;
      summary[region.type] = (summary[region.type] ?? 0) + len;
    }
    return summary;
  }, [regions]);

  return { regions, bases, annotationSummary };
}
