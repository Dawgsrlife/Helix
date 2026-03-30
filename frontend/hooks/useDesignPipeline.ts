"use client";

import { useCallback, useRef } from "react";
import { submitDesign } from "@/lib/api";
import { useHelixStore } from "@/lib/store";
import { parseSequence } from "@/lib/sequenceUtils";
import type { LikelihoodScore } from "@/types";

/**
 * Hook for the streaming design pipeline.
 *
 * Flow: POST /api/design → open WS → receive events → update store.
 *
 * Events handled:
 *   intent_parsed       → mark stage complete
 *   retrieval_progress   → update per-source status
 *   generation_token     → append base to growing sequence
 *   candidate_scored     → store 4D scores
 *   structure_ready      → set PDB for viewer
 *   explanation_chunk    → accumulate explanation text
 *   pipeline_complete    → finalize candidates, transition to analyze view
 */
export function useDesignPipeline() {
  const wsRef = useRef<WebSocket | null>(null);
  const pipelineCompletedRef = useRef(false);
  const candidateSequenceRef = useRef<Record<number, string>>({});
  const candidateScoresRef = useRef<Record<number, LikelihoodScore[]>>({});

  const setPipelineStatus = useHelixStore((s) => s.setPipelineStatus);
  const setPipelineStage = useHelixStore((s) => s.setPipelineStage);
  const setViewMode = useHelixStore((s) => s.setViewMode);
  const setSessionId = useHelixStore((s) => s.setSessionId);
  const setError = useHelixStore((s) => s.setError);
  const addCompletedStage = useHelixStore((s) => s.addCompletedStage);
  const appendGeneratingToken = useHelixStore((s) => s.appendGeneratingToken);
  const appendExplanation = useHelixStore((s) => s.appendExplanation);
  const updateRetrievalStatus = useHelixStore((s) => s.updateRetrievalStatus);
  const setRetrievalStatuses = useHelixStore((s) => s.setRetrievalStatuses);
  const setActivePdb = useHelixStore((s) => s.setActivePdb);
  const setAnalysisResult = useHelixStore((s) => s.setAnalysisResult);

  const startDesign = useCallback(
    async (goal: string) => {
      // Reset streaming state
      const store = useHelixStore.getState();
      store.reset();

      setPipelineStatus("analyzing");
      setViewMode("pipeline");
      setPipelineStage("intent");
      setRetrievalStatuses([
        { source: "ncbi", status: "pending" },
        { source: "pubmed", status: "pending" },
        { source: "clinvar", status: "pending" },
      ]);

      try {
        // Step 1: POST /api/design → get session + WS URL
        pipelineCompletedRef.current = false;
        candidateSequenceRef.current = {};
        candidateScoresRef.current = {};
        const { sessionId, wsUrl } = await submitDesign(goal, {
          numCandidates: 10,
          runProfile: "demo",
          truthMode: "demo_fallback",
        });
        setSessionId(sessionId);

        // Step 2: Open WebSocket
        useHelixStore.getState().setWsStatus("connecting");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          useHelixStore.getState().setWsStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as {
              event: string;
              data: Record<string, unknown>;
            };
            handleEvent(msg);
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = () => {
          useHelixStore.getState().setWsStatus("disconnected");
          useHelixStore.getState().setPipelineStatus("error");
          useHelixStore.getState().setViewMode("input");
          setError("WebSocket connection error");
          try {
            ws.close();
          } catch {
            // noop
          }
        };

        ws.onclose = () => {
          const store = useHelixStore.getState();
          if (!pipelineCompletedRef.current && store.pipelineStatus === "analyzing") {
            store.setPipelineStatus("error");
            store.setViewMode("input");
            store.setError("Pipeline stream ended unexpectedly. Please retry.");
          }
          wsRef.current = null;
          useHelixStore.getState().setWsStatus("disconnected");
        };
      } catch {
        const allowUiMocks = process.env.NEXT_PUBLIC_ALLOW_UI_MOCKS === "true";
        if (allowUiMocks) {
          // Explicit opt-in for local mock demos only.
          runMockPipeline(goal);
          return;
        }
        setPipelineStatus("error");
        setViewMode("input");
        setError("Could not connect to backend pipeline at http://localhost:8000 (or NEXT_PUBLIC_API_URL).");
      }
    },
    [
      setPipelineStatus,
      setViewMode,
      setPipelineStage,
      setRetrievalStatuses,
      setSessionId,
      setError,
    ]
  );

  // ── Mock pipeline (no backend) ──
  function runMockPipeline(goal: string) {
    const store = useHelixStore.getState();
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA";

    (async () => {
      await delay(600);
      store.addCompletedStage("intent");
      store.setPipelineStage("retrieval");
      await delay(500);
      store.updateRetrievalStatus("ncbi", "complete");
      await delay(400);
      store.updateRetrievalStatus("pubmed", "complete");
      await delay(300);
      store.updateRetrievalStatus("clinvar", "complete");
      store.addCompletedStage("retrieval");
      store.setPipelineStage("generation");
      // Simulate token generation
      for (let i = 0; i < 36; i++) {
        await delay(30);
        store.appendGeneratingToken("ATCG"[Math.floor(Math.random() * 4)]);
      }
      store.addCompletedStage("generation");
      store.addCompletedStage("scoring");
      store.setPipelineStage("structure");
      await delay(800);
      store.addCompletedStage("structure");
      store.setPipelineStage("explanation");
      await delay(600);
      store.appendExplanation("Candidate preserves core promoter-like motifs consistent with the design goal.");
      store.addCompletedStage("explanation");
      await delay(400);
      // Build result from the sequence
      const { analyzeSequence } = await import("@/lib/api");
      try {
        const result = await analyzeSequence(seq);
        store.setAnalysisResult(result);
      } catch {
        // If even the analyze call fails, build minimal result
        const regions = parseSequenceToRegions(seq);
        const perPositionScores = generateMockScores(seq);
        store.setAnalysisResult({
          rawSequence: seq,
          regions,
          perPositionScores,
          predictedProteins: [],
        });
      }
    })();
  }

  // ── Event dispatcher ──
  function handleEvent(msg: { event: string; data: Record<string, unknown> }) {
    const store = useHelixStore.getState();

    switch (msg.event) {
      case "intent_parsed": {
        store.addCompletedStage("intent");
        store.setPipelineStage("retrieval");
        break;
      }

      case "pipeline_manifest": {
        const candidateIds = Array.isArray(msg.data.candidate_ids)
          ? (msg.data.candidate_ids as number[])
          : [0];
        const placeholders = candidateIds.map((id) => ({
          id,
          sequence: "",
          scores: { functional: 0, tissue: 0, offTarget: 0, novelty: 0 },
          overall: 0,
          status: "queued",
          perPositionScores: [],
          error: null,
        }));
        store.setCandidates(placeholders);
        store.setActiveCandidateId(candidateIds[0] ?? 0);
        break;
      }

      case "stage_status": {
        const stage = String(msg.data.stage ?? "");
        const status = String(msg.data.status ?? "");
        if (status === "active") {
          store.setPipelineStage(stage);
        }
        if (status === "done" || status === "failed") {
          store.addCompletedStage(stage);
        }
        break;
      }

      case "candidate_status": {
        const candidateId = Number(msg.data.candidate_id ?? 0);
        const status = String(msg.data.status ?? "queued");
        const reason = typeof msg.data.reason === "string" ? msg.data.reason : null;
        const existing = store.candidates.find((c) => c.id === candidateId);
        const next = existing
          ? { ...existing, status, error: reason }
          : {
              id: candidateId,
              sequence: candidateSequenceRef.current[candidateId] ?? "",
              scores: { functional: 0, tissue: 0, offTarget: 0, novelty: 0 },
              overall: 0,
              status,
              perPositionScores: [],
              error: reason,
            };
        const remaining = store.candidates.filter((c) => c.id !== candidateId);
        store.setCandidates([...remaining, next].sort((a, b) => b.overall - a.overall));
        break;
      }

      case "retrieval_progress": {
        const source = msg.data.source as string;
        const status = msg.data.status as "pending" | "running" | "complete" | "failed";
        store.updateRetrievalStatus(source, status);

        // Check if all retrievals are done
        const statuses = store.retrievalStatuses.map((r) =>
          r.source === source ? { ...r, status } : r
        );
        const allDone = statuses.every(
          (r) => r.status === "complete" || r.status === "failed"
        );
        if (allDone) {
          store.addCompletedStage("retrieval");
          store.setPipelineStage("generation");
        }
        break;
      }

      case "generation_token": {
        const token = msg.data.token as string;
        const candidateId = Number(msg.data.candidate_id ?? 0);
        const current = candidateSequenceRef.current[candidateId] ?? "";
        candidateSequenceRef.current[candidateId] = `${current}${token}`;

        const existing = store.candidates.find((c) => c.id === candidateId);
        if (existing) {
          const updated = {
            ...existing,
            sequence: candidateSequenceRef.current[candidateId],
            status: existing.status === "queued" ? "running" : existing.status,
          };
          const rest = store.candidates.filter((c) => c.id !== candidateId);
          store.setCandidates([...rest, updated].sort((a, b) => b.overall - a.overall));
        }
        store.appendGeneratingToken(token);
        break;
      }

      case "candidate_scored": {
        store.addCompletedStage("generation");
        store.addCompletedStage("scoring");
        store.setPipelineStage("structure");

        const scores = msg.data.scores as {
          functional: number;
          tissue_specificity: number;
          off_target: number;
          novelty: number;
          combined?: number;
        };
        const candidateId = (msg.data.candidate_id as number) ?? 0;
        const perPosition = Array.isArray(msg.data.per_position_scores)
          ? (msg.data.per_position_scores as Array<{ position: number; score: number }>)
          : [];
        candidateScoresRef.current[candidateId] = perPosition;
        const generatedSequence = candidateSequenceRef.current[candidateId] ?? "";

        // Update or create candidate with real scores
        const existing = store.candidates.find((c) => c.id === candidateId);
        const nextCandidate = {
          ...(existing ?? {
            id: candidateId,
            sequence: generatedSequence,
            scores: { functional: 0, tissue: 0, offTarget: 0, novelty: 0 },
            overall: 0,
            status: "running",
            perPositionScores: [],
            error: null,
          }),
          sequence: generatedSequence || existing?.sequence || "",
          scores: {
            functional: scores.functional,
            tissue: scores.tissue_specificity,
            offTarget: scores.off_target,
            novelty: scores.novelty,
          },
          overall: (scores.combined ?? 0) * 100,
          status: "scored",
          perPositionScores: perPosition,
          error: null,
        };
        const remaining = store.candidates.filter((c) => c.id !== candidateId);
        const nextCandidates = [...remaining, nextCandidate].sort((a, b) => b.overall - a.overall);
        store.setCandidates(nextCandidates);

        if (store.activeCandidateId === candidateId && perPosition.length > 0) {
          const bases = parseSequence(nextCandidate.sequence, store.regions).map((base, i) => ({
            ...base,
            likelihoodScore: perPosition[i]?.score,
          }));
          useHelixStore.setState({ scores: perPosition, bases, rawSequence: nextCandidate.sequence });
        }
        break;
      }

      case "structure_ready": {
        store.addCompletedStage("structure");
        store.setPipelineStage("explanation");
        const pdbData = msg.data.pdb_data as string;
        if (pdbData) store.setActivePdb(pdbData);
        break;
      }

      case "explanation_chunk": {
        const text = msg.data.text as string;
        store.appendExplanation(text);
        break;
      }

      case "pipeline_complete": {
        pipelineCompletedRef.current = true;
        store.addCompletedStage("explanation");

        const candidates = msg.data.candidates as Array<{
          id: number;
          sequence: string;
          status?: string;
          error?: string | null;
          scores: {
            functional: number;
            tissue_specificity: number;
            off_target: number;
            novelty: number;
            combined?: number;
          };
          pdb_data?: string;
        }>;

        if (candidates && candidates.length > 0) {
          const sortedIncoming = [...candidates].sort(
            (a, b) => (b.scores?.combined ?? -1) - (a.scores?.combined ?? -1)
          );
          const primarySeq = sortedIncoming[0].sequence;
          const regions = parseSequenceToRegions(primarySeq);
          const primaryScores =
            candidateScoresRef.current[sortedIncoming[0].id] ??
            generateMockScores(primarySeq);

          // Build AnalysisResult from pipeline data
          const result = {
            rawSequence: primarySeq,
            regions,
            perPositionScores: primaryScores,
            predictedProteins: candidates
              .filter((c) => c.pdb_data)
              .map((c) => ({
                regionStart: 0,
                regionEnd: c.sequence.length,
                pdbData: c.pdb_data,
                sequenceIdentity: undefined,
              })),
          };

          // Build frontend candidates
          const mappedCandidates = candidates.map((c) => ({
            id: c.id,
            sequence: c.sequence,
            scores: {
              functional: c.scores.functional,
              tissue: c.scores.tissue_specificity,
              offTarget: c.scores.off_target,
              novelty: c.scores.novelty,
            },
            overall: (c.scores.combined ?? 0) * 100,
            status: c.status ?? "scored",
            perPositionScores: candidateScoresRef.current[c.id] ?? [],
            error: c.error ?? null,
          }));
          mappedCandidates.sort((a, b) => b.overall - a.overall);

          store.setCandidates(mappedCandidates);
          store.setActiveCandidateId(mappedCandidates[0]?.id ?? null);

          // This will parse sequence, set bases, regions, scores, and transition to analyze view
          store.setAnalysisResult(result);
        } else {
          // Fallback: use generating sequence
          store.setPipelineStatus("complete");
          store.setViewMode("analyze");
        }

        // Clean up WS
        wsRef.current?.close();
        wsRef.current = null;
        break;
      }
    }
  }

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  return { startDesign, disconnect };
}

// ── Helpers to build analysis data from pipeline output ──

function parseSequenceToRegions(sequence: string) {
  // Simple heuristic: find ORF-like regions (ATG...TAA/TAG/TGA)
  const regions: Array<{
    start: number;
    end: number;
    type: "orf" | "intergenic" | "exon";
    label?: string;
    score?: number;
  }> = [];

  let i = 0;
  while (i < sequence.length - 2) {
    if (sequence.substring(i, i + 3) === "ATG") {
      const start = i;
      let end = i + 3;
      while (end < sequence.length - 2) {
        const codon = sequence.substring(end, end + 3);
        if (codon === "TAA" || codon === "TAG" || codon === "TGA") {
          end += 3;
          break;
        }
        end += 3;
      }
      if (end > start + 9) {
        regions.push({
          start,
          end: Math.min(end, sequence.length),
          type: "orf",
          label: `ORF ${regions.length + 1}`,
          score: -1.5 + Math.random() * 2,
        });
      }
      i = end;
    } else {
      i++;
    }
  }

  // Fill gaps as intergenic
  if (regions.length === 0) {
    regions.push({
      start: 0,
      end: sequence.length,
      type: "intergenic",
      label: "Intergenic",
      score: -2.0 + Math.random(),
    });
  }

  return regions;
}

function generateMockScores(sequence: string) {
  return Array.from({ length: sequence.length }, (_, i) => ({
    position: i,
    score: -3 + Math.random() * 4,
  }));
}
