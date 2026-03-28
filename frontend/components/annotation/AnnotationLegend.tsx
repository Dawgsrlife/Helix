"use client";

import type { SequenceRegion, AnnotationType } from "@/types";
import { ANNOTATION_COLORS, ANNOTATION_LABELS } from "@/lib/colorMap";

interface AnnotationLegendProps {
  regions: SequenceRegion[];
}

export default function AnnotationLegend({ regions }: AnnotationLegendProps) {
  // Deduplicate annotation types present in the data
  const presentTypes = Array.from(
    new Set(regions.map((r) => r.type))
  ) as AnnotationType[];

  if (presentTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {presentTypes.map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: ANNOTATION_COLORS[type] }}
          />
          <span className="text-xs text-[var(--text-muted)]">
            {ANNOTATION_LABELS[type]}
          </span>
        </div>
      ))}
    </div>
  );
}
