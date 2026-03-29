import { memo, useMemo } from "react";
import { ReactFlow, Background, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { PipelineState } from "../types";
import { STAGE_KEYS } from "../store/pipelineReducer";

const LABEL: Record<(typeof STAGE_KEYS)[number], string> = {
  intent: "Intent",
  retrieval: "Retrieval",
  generation: "Generation",
  scoring: "Scoring",
  structure: "Structure",
  explanation: "Explanation",
  complete: "Complete"
};

function stageColor(status: string): string {
  if (status === "done") return "#09d49c";
  if (status === "active") return "#f6c14d";
  if (status === "failed") return "#ff5a6f";
  return "#364256";
}

export const StageFlow = memo(function StageFlow({ stages }: { stages: PipelineState["stages"] }) {
  const { nodes, edges } = useMemo(() => {
    const builtNodes: Node[] = STAGE_KEYS.map((stage, index) => ({
      id: stage,
      position: { x: index * 220, y: 24 },
      data: { label: `${LABEL[stage]} ${Math.round((stages[stage].progress ?? 0) * 100)}%` },
      style: {
        width: 180,
        borderRadius: 14,
        border: `1px solid ${stageColor(stages[stage].status)}`,
        color: "#f4f6ff",
        background:
          stages[stage].status === "active"
            ? "linear-gradient(140deg, rgba(246,193,77,0.22), rgba(17,26,44,0.96))"
            : "linear-gradient(140deg, rgba(8,15,26,0.98), rgba(11,20,35,0.96))",
        boxShadow: stages[stage].status === "active" ? "0 0 30px rgba(246,193,77,0.2)" : "none",
        padding: 8,
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: 14
      }
    }));

    const builtEdges: Edge[] = STAGE_KEYS.slice(0, -1).map((stage, index) => {
      const next = STAGE_KEYS[index + 1];
      const active = ["active", "done"].includes(stages[stage].status);
      return {
        id: `${stage}-${next}`,
        source: stage,
        target: next,
        animated: active,
        style: {
          stroke: active ? "#09d49c" : "#2f3a4e",
          strokeWidth: 2
        }
      };
    });

    return { nodes: builtNodes, edges: builtEdges };
  }, [stages]);

  return (
    <div className="stage-flow">
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.15 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnScroll={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}>
        <Background color="#15233a" gap={22} size={1} />
      </ReactFlow>
    </div>
  );
});
