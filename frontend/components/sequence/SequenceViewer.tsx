"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Base, SequenceRegion } from "@/types";
import BaseToken from "./BaseToken";
import { formatPosition } from "@/lib/sequenceUtils";

interface SequenceViewerProps {
  bases: Base[];
  regions: SequenceRegion[];
  highlightedPosition?: number;
  onBaseClick: (position: number) => void;
}

const BASES_PER_LINE = 80;
const BASES_PER_BLOCK = 10;

export default function SequenceViewer({
  bases,
  regions,
  highlightedPosition,
  onBaseClick,
}: SequenceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  // GSAP stagger animation on initial load
  useEffect(() => {
    if (!containerRef.current || hasAnimated.current || bases.length === 0) return;
    hasAnimated.current = true;

    const tokens = containerRef.current.querySelectorAll("[data-base-token]");
    // Only animate the first visible chunk for performance
    const visibleTokens = Array.from(tokens).slice(0, BASES_PER_LINE * 3);

    gsap.fromTo(
      visibleTokens,
      { opacity: 0, y: 4 },
      {
        opacity: 1,
        y: 0,
        duration: 0.3,
        stagger: 0.002,
        ease: "power2.out",
      }
    );

    return () => {
      gsap.killTweensOf(visibleTokens);
    };
  }, [bases.length]);

  if (bases.length === 0) {
    return (
      <div className="text-[var(--text-muted)] text-sm">
        No sequence loaded
      </div>
    );
  }

  // Split bases into lines
  const lines: Base[][] = [];
  for (let i = 0; i < bases.length; i += BASES_PER_LINE) {
    lines.push(bases.slice(i, i + BASES_PER_LINE));
  }

  return (
    <div ref={containerRef} className="font-mono text-sm leading-relaxed">
      {lines.map((line, lineIdx) => {
        const lineStart = lineIdx * BASES_PER_LINE;
        return (
          <div key={lineIdx} className="flex items-start gap-4 hover:bg-[var(--bg-panel)] rounded px-2 -mx-2">
            {/* Position gutter */}
            <span className="text-[var(--text-muted)] text-xs w-16 text-right pt-1 select-none shrink-0 tabular-nums">
              {formatPosition(lineStart)}
            </span>

            {/* Bases with block spacing */}
            <div className="flex-1">
              {line.map((base, i) => (
                <span
                  key={base.position}
                  data-base-token
                  className={i > 0 && i % BASES_PER_BLOCK === 0 ? "ml-2" : ""}
                >
                  <BaseToken
                    nucleotide={base.nucleotide}
                    position={base.position}
                    annotationType={base.annotationType}
                    isHighlighted={base.position === highlightedPosition}
                    likelihoodScore={base.likelihoodScore}
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
