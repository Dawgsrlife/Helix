"use client";

import { useState } from "react";
import type { SequenceRegion } from "@/types";

interface RegionHighlightProps {
  region: SequenceRegion;
  sequenceLength: number;
}

const REGION_VARS: Record<string, string> = {
  exon: "var(--annotation-exon)",
  intron: "var(--annotation-intron)",
  orf: "var(--annotation-orf)",
  prophage: "var(--annotation-prophage)",
  trna: "var(--annotation-trna)",
  rrna: "var(--annotation-rrna)",
  intergenic: "var(--annotation-intergenic)",
  unknown: "var(--annotation-unknown)",
};

const REGION_NAMES: Record<string, string> = {
  exon: "Exon",
  intron: "Intron",
  orf: "ORF",
  prophage: "Prophage",
  trna: "tRNA",
  rrna: "rRNA",
  intergenic: "Intergenic",
  unknown: "Unknown",
};

export default function RegionHighlight({
  region,
  sequenceLength,
}: RegionHighlightProps) {
  const [hovered, setHovered] = useState(false);

  const leftPct = (region.start / sequenceLength) * 100;
  const widthPct = ((region.end - region.start) / sequenceLength) * 100;
  const color = REGION_VARS[region.type] ?? "var(--annotation-unknown)";
  const label = region.label ?? REGION_NAMES[region.type] ?? region.type;

  return (
    <div
      className="absolute top-0 bottom-0 cursor-pointer"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: hovered
          ? `color-mix(in oklch, ${color}, transparent 80%)`
          : `color-mix(in oklch, ${color}, transparent 90%)`,
        borderBottom: `2px solid ${color}`,
        transition: "background-color 0.15s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip on hover */}
      {hovered && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            top: "-32px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid rgba(62, 73, 70, 0.15)",
            borderRadius: "4px",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            fontSize: "11px",
            color: "var(--text-primary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ color }}>{label}</span>
          <span style={{ color: "var(--text-muted)", marginLeft: "6px" }}>
            {region.start}-{region.end}
          </span>
        </div>
      )}
    </div>
  );
}
