"use client";

import type { SequenceRegion } from "@/types";
import { ANNOTATION_COLORS, ANNOTATION_LABELS } from "@/lib/colorMap";

interface RegionHighlightProps {
  region: SequenceRegion;
  sequenceLength: number;
}

export default function RegionHighlight({
  region,
  sequenceLength,
}: RegionHighlightProps) {
  const leftPercent = (region.start / sequenceLength) * 100;
  const widthPercent = ((region.end - region.start) / sequenceLength) * 100;
  const color = ANNOTATION_COLORS[region.type];

  return (
    <div
      className="absolute top-0 bottom-0 opacity-60 hover:opacity-90 transition-opacity cursor-pointer group"
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        borderBottom: `2px solid ${color}`,
      }}
      title={`${ANNOTATION_LABELS[region.type]}: ${region.start}-${region.end}${region.label ? ` (${region.label})` : ""}`}
    >
      {/* Label shown on hover for large enough regions */}
      {widthPercent > 3 && (
        <span
          className="absolute top-0.5 left-1 text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate"
          style={{ color }}
        >
          {region.label ?? ANNOTATION_LABELS[region.type]}
        </span>
      )}
    </div>
  );
}
