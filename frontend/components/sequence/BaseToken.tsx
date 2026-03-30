"use client";

import { memo, useCallback } from "react";
import type { Nucleotide, AnnotationType } from "@/types";

interface BaseTokenProps {
  nucleotide: Nucleotide;
  position: number;
  annotationType?: AnnotationType;
  likelihoodScore?: number;
  isHighlighted: boolean;
  onClick: (position: number) => void;
}

const BASE_HEX: Record<Nucleotide, string> = {
  A: "var(--base-a)",
  T: "var(--base-t)",
  C: "var(--base-c)",
  G: "var(--base-g)",
  N: "var(--base-n)",
};

const REGION_TINT: Record<AnnotationType, string> = {
  exon: "rgba(124, 107, 196, 0.08)",
  intron: "transparent",
  orf: "rgba(91, 181, 162, 0.08)",
  prophage: "rgba(196, 107, 107, 0.08)",
  trna: "rgba(107, 189, 122, 0.08)",
  rrna: "rgba(201, 168, 85, 0.08)",
  intergenic: "transparent",
  unknown: "transparent",
};

function BaseTokenInner({
  nucleotide,
  position,
  annotationType,
  likelihoodScore,
  isHighlighted,
  onClick,
}: BaseTokenProps) {
  const handleClick = useCallback(() => onClick(position), [onClick, position]);

  const heat = (() => {
    if (typeof likelihoodScore !== "number") return "transparent";
    const normalized = Math.max(0, Math.min(1, (likelihoodScore + 3) / 6));
    // Low likelihood -> warm risk tint, high likelihood -> cool confidence tint.
    if (normalized >= 0.5) {
      const alpha = 0.04 + (normalized - 0.5) * 0.18;
      return `rgba(91, 181, 162, ${alpha.toFixed(3)})`;
    }
    const alpha = 0.04 + (0.5 - normalized) * 0.2;
    return `rgba(212, 122, 122, ${alpha.toFixed(3)})`;
  })();

  const bgColor = isHighlighted
    ? "rgba(91, 181, 162, 0.18)"
    : annotationType
      ? REGION_TINT[annotationType]
      : heat;

  return (
    <span
      onClick={handleClick}
      data-pos={position}
      className="inline-block w-[1ch] text-center cursor-pointer select-none"
      style={{
        color: BASE_HEX[nucleotide],
        backgroundColor: bgColor,
        lineHeight: "22px",
        fontSize: "13px",
        borderBottom: isHighlighted
          ? "1.5px solid var(--accent)"
          : "1.5px solid transparent",
      }}
    >
      {nucleotide}
    </span>
  );
}

const BaseToken = memo(BaseTokenInner);
export default BaseToken;
