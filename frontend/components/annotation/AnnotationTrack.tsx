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
    <div className="relative h-6 bg-[var(--bg-panel)] rounded overflow-hidden">
      {regions.map((region, i) => (
        <RegionHighlight
          key={`${region.start}-${region.end}-${i}`}
          region={region}
          sequenceLength={sequenceLength}
        />
      ))}
    </div>
  );
}
