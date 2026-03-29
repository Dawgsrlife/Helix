"use client";

import type { SequenceRegion } from "@/types";
import RegionHighlight from "@/components/sequence/RegionHighlight";

interface AnnotationTrackProps {
  regions: SequenceRegion[];
  sequenceLength: number;
}

export default function AnnotationTrack({
  regions,
  sequenceLength,
}: AnnotationTrackProps) {
  if (sequenceLength === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span
        className="select-none uppercase tracking-wider"
        style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 600, letterSpacing: "0.05em" }}
      >
        Annotations
      </span>
      <div
        className="relative overflow-hidden"
        style={{
          height: "20px",
          backgroundColor: "var(--surface-base)",
          borderRadius: "3px",
        }}
      >
        {regions.map((region, i) => (
          <RegionHighlight
            key={`${region.start}-${region.end}-${i}`}
            region={region}
            sequenceLength={sequenceLength}
          />
        ))}
      </div>
    </div>
  );
}
