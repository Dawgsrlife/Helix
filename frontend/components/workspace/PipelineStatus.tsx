"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useHelixStore } from "@/lib/store";
import { Check, Loader2 } from "lucide-react";

const STAGES = [
  { id: "intent", label: "Parsing design goal" },
  { id: "retrieval", label: "Retrieving context" },
  { id: "generation", label: "Generating candidates" },
  { id: "scoring", label: "Scoring candidates" },
  { id: "structure", label: "Predicting structure" },
  { id: "explanation", label: "Generating explanation" },
];

const SIMULATION_DURATIONS: Record<string, number> = {
  intent: 600,
  retrieval: 1800,
  generation: 1500,
  scoring: 1000,
  structure: 1200,
  explanation: 800,
};

export default function PipelineStatus() {
  const pipelineStatus = useHelixStore((s) => s.pipelineStatus);
  const storeCompleted = useHelixStore((s) => s.completedStages);
  const pipelineStage = useHelixStore((s) => s.pipelineStage);
  const sessionId = useHelixStore((s) => s.sessionId);
  const generationTokenCount = useHelixStore((s) => s.generationTokenCount);
  const retrievalStatuses = useHelixStore((s) => s.retrievalStatuses);
  const explanation = useHelixStore((s) => s.explanation);
  const generatingSequence = useHelixStore((s) => s.generatingSequence);
  const candidates = useHelixStore((s) => s.candidates);

  // Local simulation state (fallback when no WebSocket)
  const [simCompleted, setSimCompleted] = useState<string[]>([]);
  const [simActive, setSimActive] = useState(0);

  const isStreaming = sessionId !== null;
  const completedStages = isStreaming ? storeCompleted : simCompleted;

  // Simulation fallback (runs when no session — i.e., /api/analyze path)
  useEffect(() => {
    if (pipelineStatus !== "analyzing" || isStreaming) return;
    setSimCompleted([]);
    setSimActive(0);

    let timeout: NodeJS.Timeout;
    let current = 0;

    const advance = () => {
      if (current >= STAGES.length) return;
      setSimActive(current);
      timeout = setTimeout(() => {
        setSimCompleted((prev) => [...prev, STAGES[current].id]);
        current++;
        advance();
      }, SIMULATION_DURATIONS[STAGES[current].id] ?? 800);
    };

    advance();
    return () => clearTimeout(timeout);
  }, [pipelineStatus, isStreaming]);

  if (pipelineStatus !== "analyzing") return null;

  const allDone = completedStages.length >= STAGES.length;
  const progress = allDone ? 100 : ((completedStages.length) / STAGES.length) * 100;

  // Determine active stage index
  const activeStageIdx = isStreaming
    ? STAGES.findIndex((s) => s.id === pipelineStage)
    : simActive;

  // Build retrieval sub-status display
  const retrievalDetail = retrievalStatuses.length > 0
    ? retrievalStatuses.map((r) => {
        const icon = r.status === "complete" ? "\u2713" : r.status === "failed" ? "\u2717" : "\u2026";
        return `${r.source.toUpperCase()} ${icon}`;
      }).join("  ")
    : null;

  return (
    <div className="flex-1 flex items-center justify-center px-8 py-12" style={{ background: "var(--surface-base)" }}
      role="status" aria-live="polite" aria-label="Pipeline progress">
      <div className="max-w-lg w-full">
        <h2 className="text-xl font-semibold tracking-tight mb-2">
          {isStreaming ? "Running design pipeline" : "Running analysis"}
        </h2>
        <p className="text-[13px] mb-8" style={{ color: "var(--text-muted)" }}>
          {isStreaming
            ? "Evo 2 is generating and scoring candidates in real time."
            : "Evo 2 is processing your sequence through the full pipeline."}
        </p>

        {/* Progress bar */}
        <div className="h-1 rounded-full mb-8 overflow-hidden" style={{ background: "var(--ghost-border)" }}
          role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}
          aria-label={`Pipeline ${Math.round(progress)}% complete`}>
          <motion.div className="h-full rounded-full" style={{ background: "var(--accent)" }}
            animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>

        {/* Stage list */}
        <div className="space-y-1">
          {STAGES.map((stage, i) => {
            const isComplete = completedStages.includes(stage.id);
            const isActive = i === activeStageIdx && !isComplete;

            // Build detail text for active stages
            let detail = "";
            if (isActive && isStreaming) {
              if (stage.id === "generation") detail = `${generationTokenCount} tokens`;
              if (stage.id === "explanation" && explanation) detail = `${explanation.length} chars`;
            }

            return (
              <div key={stage.id}>
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors"
                  style={{ background: isActive ? "color-mix(in oklch, var(--accent), transparent 95%)" : "transparent" }}>
                  <div className="w-5 h-5 flex items-center justify-center">
                    {isComplete ? (
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                        <Check size={14} style={{ color: "var(--accent)" }} />
                      </motion.div>
                    ) : isActive ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--surface-overlay)" }} />
                    )}
                  </div>
                  <span className="text-[13px] flex-1" style={{
                    color: isComplete ? "var(--accent)" : isActive ? "var(--text-primary)" : "var(--text-faint)",
                  }}>
                    {stage.label}
                  </span>
                  {detail && (
                    <span className="text-[11px] font-mono" style={{ color: "var(--text-faint)" }}>{detail}</span>
                  )}
                </div>
                {/* Retrieval sub-status */}
                {stage.id === "retrieval" && isActive && retrievalDetail && (
                  <div className="ml-11 text-[11px] font-mono py-1" style={{ color: "var(--text-faint)" }}>
                    {retrievalDetail}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion state */}
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-center gap-3 px-3 py-3 rounded-lg"
            style={{ background: "color-mix(in oklch, var(--accent), transparent 92%)" }}>
            <Check size={16} style={{ color: "var(--accent)" }} />
            <span className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
              Pipeline complete — loading results
            </span>
            <Loader2 size={14} className="animate-spin ml-auto" style={{ color: "var(--accent)" }} />
          </motion.div>
        )}

        {/* Live WebSocket stream (show, don't just tell) */}
        {isStreaming && (
          <div className="mt-6 space-y-3">
            <div
              className="rounded-lg p-3"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--ghost-border)" }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  Live Sequence Stream
                </span>
                <span className="text-[11px] font-mono" style={{ color: "var(--accent)" }}>
                  {generationTokenCount} tokens
                </span>
              </div>
              <div
                className="font-mono text-[11px] leading-relaxed break-all max-h-[90px] overflow-auto"
                style={{ color: "var(--text-secondary)" }}
              >
                {(generatingSequence.slice(-320) || "Waiting for generation tokens...")}
              </div>
            </div>

            <div
              className="rounded-lg p-3"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--ghost-border)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  Candidate Runtime
                </span>
                <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>
                  {candidates.length} tracked
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {candidates.slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md px-2.5 py-2 text-[11px]"
                    style={{
                      background: "var(--surface-base)",
                      border:
                        c.status === "structured"
                          ? "1px solid rgba(91,181,162,0.4)"
                          : c.status === "failed"
                            ? "1px solid rgba(212,122,122,0.45)"
                            : "1px solid var(--ghost-border)",
                      color:
                        c.status === "structured"
                          ? "var(--accent)"
                          : c.status === "failed"
                            ? "var(--base-t)"
                            : "var(--text-muted)",
                    }}
                  >
                    <div className="font-mono">#{c.id} · {c.status}</div>
                    <div className="font-mono mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {c.sequence?.length ?? 0} bp
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
