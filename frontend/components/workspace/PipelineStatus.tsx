"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useHelixStore } from "@/lib/store";
import { Check, Loader2 } from "lucide-react";

const STAGES = [
  { id: "intent", label: "Parsing design goal", duration: 600 },
  { id: "ncbi", label: "Retrieving NCBI context", duration: 800 },
  { id: "pubmed", label: "Searching PubMed literature", duration: 700 },
  { id: "clinvar", label: "Cross-referencing ClinVar", duration: 500 },
  { id: "generation", label: "Generating candidates", duration: 1500 },
  { id: "scoring", label: "Scoring candidates", duration: 1000 },
  { id: "structure", label: "Predicting structure", duration: 1200 },
  { id: "explanation", label: "Generating explanation", duration: 800 },
];

export default function PipelineStatus() {
  const pipelineStatus = useHelixStore((s) => s.pipelineStatus);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [activeStage, setActiveStage] = useState(0);

  // Simulate pipeline progression
  useEffect(() => {
    if (pipelineStatus !== "analyzing") return;
    setCompletedStages([]);
    setActiveStage(0);

    let timeout: NodeJS.Timeout;
    let current = 0;

    const advance = () => {
      if (current >= STAGES.length) return;
      setActiveStage(current);
      timeout = setTimeout(() => {
        setCompletedStages((prev) => [...prev, STAGES[current].id]);
        current++;
        advance();
      }, STAGES[current].duration);
    };

    advance();
    return () => clearTimeout(timeout);
  }, [pipelineStatus]);

  if (pipelineStatus !== "analyzing") return null;

  const progress = ((completedStages.length) / STAGES.length) * 100;

  return (
    <div className="flex-1 flex items-center justify-center px-8 py-12" style={{ background: "#141416" }}>
      <div className="max-w-lg w-full">
        <h2 className="text-xl font-semibold tracking-tight mb-2">Running analysis</h2>
        <p className="text-[13px] mb-8" style={{ color: "#888" }}>
          Evo 2 is processing your sequence through the full pipeline.
        </p>

        {/* Progress bar */}
        <div className="h-1 rounded-full mb-8 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
          <motion.div className="h-full rounded-full" style={{ background: "#5bb5a2" }}
            animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>

        {/* Stage list */}
        <div className="space-y-1">
          {STAGES.map((stage, i) => {
            const isComplete = completedStages.includes(stage.id);
            const isActive = i === activeStage && !isComplete;
            return (
              <div key={stage.id} className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors"
                style={{ background: isActive ? "rgba(91,181,162,0.05)" : "transparent" }}>
                <div className="w-5 h-5 flex items-center justify-center">
                  {isComplete ? (
                    <Check size={14} style={{ color: "#5bb5a2" }} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: "#5bb5a2" }} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#333" }} />
                  )}
                </div>
                <span className="text-[13px]" style={{
                  color: isComplete ? "#5bb5a2" : isActive ? "#F0EFED" : "#555",
                }}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
