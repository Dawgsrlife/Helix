"use client";

import { memo } from "react";
import type { Nucleotide, AnnotationType } from "@/types";
import { BASE_COLORS, ANNOTATION_COLORS } from "@/lib/colorMap";

interface BaseTokenProps {
  nucleotide: Nucleotide;
  position: number;
  annotationType?: AnnotationType;
  isHighlighted: boolean;
  likelihoodScore?: number;
  onClick: (position: number) => void;
}

function BaseTokenComponent({
  nucleotide,
  position,
  annotationType,
  isHighlighted,
  onClick,
}: BaseTokenProps) {
  const baseColor = BASE_COLORS[nucleotide];
  const bgColor = annotationType
    ? ANNOTATION_COLORS[annotationType]
    : "transparent";

  return (
    <span
      onClick={() => onClick(position)}
      className="inline-block w-[1ch] text-center cursor-pointer transition-all duration-75 leading-6 select-none"
      style={{
        color: baseColor,
        backgroundColor: isHighlighted
          ? "rgba(59, 130, 246, 0.3)"
          : annotationType
            ? `color-mix(in srgb, ${bgColor} 15%, transparent)`
            : "transparent",
        borderBottom: isHighlighted ? "2px solid var(--accent-cyan)" : "2px solid transparent",
      }}
      title={`Position ${position}: ${nucleotide}${annotationType ? ` (${annotationType})` : ""}`}
    >
      {nucleotide}
    </span>
  );
}

const BaseToken = memo(BaseTokenComponent);
export default BaseToken;
