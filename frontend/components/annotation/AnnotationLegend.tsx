"use client";

import type { SequenceRegion, AnnotationType } from "@/types";

interface AnnotationLegendProps {
  regions: SequenceRegion[];
}

const COLOR_MAP: Record<AnnotationType, string> = {
  exon: "#7c6bc4",
  intron: "#3a3a3c",
  orf: "#5bb5a2",
  prophage: "#c46b6b",
  trna: "#6bbd7a",
  rrna: "#c9a855",
  intergenic: "#2a2a2c",
  unknown: "#4a4a4a",
};

const LABEL_MAP: Record<AnnotationType, string> = {
  exon: "Exon",
  intron: "Intron",
  orf: "ORF",
  prophage: "Prophage",
  trna: "tRNA",
  rrna: "rRNA",
  intergenic: "Intergenic",
  unknown: "Unknown",
};

export default function AnnotationLegend({ regions }: AnnotationLegendProps) {
  const presentTypes = Array.from(
    new Set(regions.map((r) => r.type))
  ) as AnnotationType[];

  if (presentTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 mt-2">
      {presentTypes.map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              backgroundColor: COLOR_MAP[type],
            }}
          />
          <span style={{ fontSize: "11px", color: "#6b6b6b" }}>
            {LABEL_MAP[type]}
          </span>
        </div>
      ))}
    </div>
  );
}
