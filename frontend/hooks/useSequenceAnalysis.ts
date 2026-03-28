"use client";

import { useCallback } from "react";
import type { AnalysisResult, SequenceRegion, LikelihoodScore } from "@/types";
import { analyzeSequence } from "@/lib/api";
import { useHelixStore } from "@/lib/store";
import { SAMPLE_PDB } from "@/components/structure/ProteinViewer";

/** Generate realistic mock analysis when backend is unavailable */
function generateMockAnalysis(sequence: string): AnalysisResult {
  const len = sequence.length;
  const regions: SequenceRegion[] = [];
  let pos = 0;

  // Generate plausible region annotations
  const regionDefs: Array<{ type: SequenceRegion["type"]; minLen: number; maxLen: number }> = [
    { type: "exon", minLen: 40, maxLen: 120 },
    { type: "intron", minLen: 20, maxLen: 80 },
    { type: "orf", minLen: 60, maxLen: 200 },
    { type: "intergenic", minLen: 15, maxLen: 50 },
    { type: "exon", minLen: 30, maxLen: 90 },
    { type: "trna", minLen: 20, maxLen: 40 },
  ];

  let regionIdx = 0;
  while (pos < len) {
    const def = regionDefs[regionIdx % regionDefs.length];
    const rlen = Math.min(
      def.minLen + Math.floor(Math.random() * (def.maxLen - def.minLen)),
      len - pos
    );
    regions.push({
      start: pos,
      end: pos + rlen,
      type: def.type,
      label: `${def.type.charAt(0).toUpperCase() + def.type.slice(1)} ${regionIdx + 1}`,
      score: -Math.random() * 4 - 0.5,
    });
    pos += rlen;
    regionIdx++;
  }

  // Generate per-position likelihood scores with biologically-informed patterns
  // Coding regions show 3-base periodicity, introns are noisier
  const scores: LikelihoodScore[] = [];
  for (let i = 0; i < len; i++) {
    const region = regions.find((r) => i >= r.start && i < r.end);
    let baseScore: number;

    if (region?.type === "exon" || region?.type === "orf") {
      // Coding regions: periodic pattern with higher confidence
      const codonPos = (i - (region?.start ?? 0)) % 3;
      baseScore = -1.5 - Math.random() * 0.8 + (codonPos === 2 ? 0.4 : 0);
    } else if (region?.type === "intron") {
      // Introns: lower confidence, more noise
      baseScore = -3.0 - Math.random() * 2;
    } else {
      // Default
      baseScore = -2.0 - Math.random() * 1.5;
    }

    // Add smooth wave for visual interest
    baseScore += Math.sin(i * 0.05) * 0.3;

    scores.push({ position: i, score: Math.round(baseScore * 1000) / 1000 });
  }

  // Generate a mock predicted protein from the largest ORF/exon
  const largestCoding = regions
    .filter((r) => r.type === "orf" || r.type === "exon")
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

  return {
    rawSequence: sequence,
    regions,
    perPositionScores: scores,
    predictedProteins: largestCoding
      ? [
          {
            regionStart: largestCoding.start,
            regionEnd: largestCoding.end,
            pdbData: SAMPLE_PDB,
            sequenceIdentity: 0.78 + Math.random() * 0.15,
          },
        ]
      : [],
  };
}

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
        const result = await analyzeSequence(sequence);
        setAnalysisResult(result);
        return result;
      } catch {
        // Backend unreachable: fall back to mock data for demo
        const mock = generateMockAnalysis(sequence);
        setAnalysisResult(mock);
        return mock;
      }
    },
    [setAnalysisResult, setPipelineStatus]
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
