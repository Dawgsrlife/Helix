"use client";

import { useEffect, useRef, useMemo } from "react";
import gsap from "gsap";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  // GSAP stagger reveal: bases fade in left-to-right on first load
  useEffect(() => {
    if (!containerRef.current || hasAnimated.current || bases.length === 0)
      return;
    hasAnimated.current = true;

    const tokens = containerRef.current.querySelectorAll("[data-pos]");
    const visible = Array.from(tokens).slice(0, BASES_PER_LINE * 4);

    gsap.set(visible, { opacity: 0, y: 3 });
    gsap.to(visible, {
      opacity: 1,
      y: 0,
      duration: 0.25,
      stagger: 0.0015,
      ease: "power2.out",
    });

    return () => {
      gsap.killTweensOf(visible);
    };
  }, [bases.length]);

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
      <div className="flex items-center justify-center h-full" style={{ color: "#4a4a4a" }}>
        <span style={{ fontSize: "13px" }}>No sequence loaded</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
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
              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(27, 27, 29, 0.5)";
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
                color: "#3a3a3c",
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
