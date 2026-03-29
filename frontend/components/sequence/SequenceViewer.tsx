"use client";

import { useMemo } from "react";
import type { Base, SequenceRegion } from "@/types";
import BaseToken from "./BaseToken";

interface SequenceViewerProps {
  bases: Base[];
  regions: SequenceRegion[];
  highlightedPosition?: number;
  onBaseClick: (position: number) => void;
}

const BASES_PER_LINE = 60;
const BASES_PER_BLOCK = 10;

export default function SequenceViewer({
  bases,
  regions,
  highlightedPosition,
  onBaseClick,
}: SequenceViewerProps) {
  // Pre-compute lines for rendering
  const lines = useMemo(() => {
    const result: Base[][] = [];
    for (let i = 0; i < bases.length; i += BASES_PER_LINE) {
      result.push(bases.slice(i, i + BASES_PER_LINE));
    }
    return result;
  }, [bases]);

  if (bases.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--text-faint)" }}>
        <span style={{ fontSize: "13px" }}>No sequence loaded</span>
      </div>
    );
  }

  return (
    <div
      className="font-mono overflow-auto"
      style={{ fontSize: "13px", lineHeight: "22px" }}
    >
      {lines.map((line, lineIdx) => {
        const lineStart = lineIdx * BASES_PER_LINE;
        return (
          <div
            key={lineIdx}
            className="flex items-start gap-3"
            style={{
              paddingLeft: "8px",
              paddingRight: "8px",
              borderRadius: "2px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in oklch, var(--surface-raised), transparent 50%)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            {/* Line number gutter */}
            <span
              className="select-none shrink-0 text-right tabular-nums"
              style={{
                width: "48px",
                color: "var(--text-faint)",
                fontSize: "11px",
                lineHeight: "22px",
                paddingTop: "0px",
              }}
            >
              {lineStart}
            </span>

            {/* Base tokens with block spacing */}
            <div className="flex-1 flex flex-wrap">
              {line.map((base, i) => (
                <span
                  key={base.position}
                  style={{
                    marginLeft: i > 0 && i % BASES_PER_BLOCK === 0 ? "6px" : "0",
                  }}
                >
                  <BaseToken
                    nucleotide={base.nucleotide}
                    position={base.position}
                    annotationType={base.annotationType}
                    isHighlighted={base.position === highlightedPosition}
                    onClick={onBaseClick}
                  />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
