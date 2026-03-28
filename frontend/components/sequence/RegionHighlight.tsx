"use client";

import { useState } from "react";
import type { SequenceRegion } from "@/types";

interface RegionHighlightProps {
  region: SequenceRegion;
  sequenceLength: number;
}

const REGION_COLORS: Record<string, string> = {
  exon: "#7c6bc4",
  intron: "#3a3a3c",
  orf: "#5bb5a2",
  prophage: "#c46b6b",
  trna: "#6bbd7a",
  rrna: "#c9a855",
  intergenic: "#2a2a2c",
  unknown: "#4a4a4a",
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
  const color = REGION_COLORS[region.type] ?? "#4a4a4a";
  const label = region.label ?? REGION_NAMES[region.type] ?? region.type;

  return (
    <div
      className="absolute top-0 bottom-0 cursor-pointer"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: hovered
          ? `${color}33`
          : `${color}1a`,
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
            backgroundColor: "#1b1b1d",
            border: "1px solid rgba(62, 73, 70, 0.15)",
            borderRadius: "4px",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            fontSize: "11px",
            color: "#e5e1e4",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ color }}>{label}</span>
          <span style={{ color: "#6b6b6b", marginLeft: "6px" }}>
            {region.start}-{region.end}
          </span>
        </div>
      )}
    </div>
  );
}
