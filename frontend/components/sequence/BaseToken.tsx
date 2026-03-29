"use client";

import { memo, useCallback } from "react";
import type { Nucleotide, AnnotationType } from "@/types";

interface BaseTokenProps {
  nucleotide: Nucleotide;
  position: number;
  annotationType?: AnnotationType;
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
  isHighlighted,
  onClick,
}: BaseTokenProps) {
  const handleClick = useCallback(() => onClick(position), [onClick, position]);

  const bg = isHighlighted
    ? "rgba(91, 181, 162, 0.18)"
    : annotationType
      ? REGION_TINT[annotationType]
      : "transparent";

  return (
    <span
      onClick={handleClick}
      data-pos={position}
      className="inline-block w-[1ch] text-center cursor-pointer select-none"
      style={{
        color: BASE_HEX[nucleotide],
        backgroundColor: bg,
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
