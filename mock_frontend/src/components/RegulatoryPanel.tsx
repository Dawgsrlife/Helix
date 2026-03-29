import { useMemo } from "react";

import type { CandidateState } from "../types";

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function RegulatoryPanel({ candidate }: { candidate: CandidateState | null }) {
  const map = candidate?.regulatoryMap ?? null;

  const features = useMemo(() => {
    if (!map) return [];
    return map.features.slice().sort((a, b) => a.start - b.start);
  }, [map]);

  if (!candidate) {
    return <div className="protein-fallback">Select a candidate to view regulatory visualization.</div>;
  }

  if (!map) {
    return <div className="protein-fallback">Regulatory map will appear after scoring.</div>;
  }

  const width = 960;
  const hotspotHeight = 72;
  const gcHeight = 70;
  const laneY = 116;
  const laneHeight = 20;
  const totalHeight = 176;
  const sequenceLength = Math.max(1, map.sequence_length);

  return (
    <div className="regulatory-wrap">
      <div className="regulatory-summary">
        <span>Candidate #{candidate.id}</span>
        <span>Length {map.sequence_length} bp</span>
        <span>GC {Math.round(map.gc_content * 100)}%</span>
        <span>{features.length} motif hits</span>
      </div>

      <div className="regulatory-canvas-wrap">
        <svg viewBox={`0 0 ${width} ${totalHeight}`} className="regulatory-canvas" role="img" aria-label="Regulatory landscape">
          <defs>
            <linearGradient id="gcGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(9,212,156,0.85)" />
              <stop offset="100%" stopColor="rgba(9,212,156,0.05)" />
            </linearGradient>
            <linearGradient id="hotspotGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(246,193,77,0.85)" />
              <stop offset="100%" stopColor="rgba(246,193,77,0.1)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={width} height={totalHeight} rx="10" fill="rgba(4,11,20,0.92)" stroke="rgba(144,169,204,0.25)" />

          {map.hotspots.length > 0
            ? map.hotspots.map((value, index) => {
                const x = (index / Math.max(1, map.hotspots.length - 1)) * (width - 20) + 10;
                const intensity = clamp01(value);
                const h = intensity * hotspotHeight;
                if (h < 1) return null;
                return (
                  <rect
                    key={`hot-${index}`}
                    x={x}
                    y={hotspotHeight - h + 8}
                    width={Math.max(1.6, (width - 20) / map.hotspots.length)}
                    height={h}
                    fill="url(#hotspotGradient)"
                    opacity={0.35 + intensity * 0.5}
                  />
                );
              })
            : null}

          <line x1="10" x2={width - 10} y1={hotspotHeight + 8} y2={hotspotHeight + 8} stroke="rgba(144,169,204,0.22)" strokeDasharray="4 3" />

          {map.gc_windows.map((window, index) => {
            const x = (window.start / sequenceLength) * (width - 20) + 10;
            const w = Math.max(2, ((window.end - window.start) / sequenceLength) * (width - 20));
            const h = clamp01(window.gc) * gcHeight;
            return (
              <rect
                key={`gc-${index}`}
                x={x}
                y={hotspotHeight + 16 + (gcHeight - h)}
                width={w}
                height={h}
                fill="url(#gcGradient)"
                opacity={0.4 + clamp01(window.gc) * 0.45}
              />
            );
          })}

          <rect x="10" y={laneY} width={width - 20} height={laneHeight} rx="6" fill="rgba(9,212,156,0.08)" stroke="rgba(9,212,156,0.25)" />

          {features.map((feature, index) => {
            const x = (feature.start / sequenceLength) * (width - 20) + 10;
            const w = Math.max(4, ((feature.end - feature.start) / sequenceLength) * (width - 20));
            const hue = 130 + ((index * 37) % 120);
            return (
              <g key={`${feature.name}-${index}`}>
                <rect
                  x={x}
                  y={laneY + 1}
                  width={w}
                  height={laneHeight - 2}
                  rx="4"
                  fill={`hsla(${hue}, 75%, 58%, ${0.45 + clamp01(feature.score) * 0.35})`}
                />
                <title>{`${feature.name} (${feature.start}-${feature.end})`}</title>
              </g>
            );
          })}

          <text x="14" y="17" fill="rgba(234,243,255,0.88)" fontSize="12" fontFamily="IBM Plex Mono">Motif hotspot intensity</text>
          <text x="14" y={hotspotHeight + 28} fill="rgba(234,243,255,0.88)" fontSize="12" fontFamily="IBM Plex Mono">Sliding-window GC profile</text>
          <text x="14" y={laneY + 14} fill="rgba(234,243,255,0.88)" fontSize="12" fontFamily="IBM Plex Mono">Regulatory motif lane</text>
        </svg>
      </div>

      <div className="regulatory-legend">
        {features.slice(0, 8).map((feature, index) => (
          <div key={`${feature.name}-${index}`} className="legend-chip">
            <strong>{feature.name}</strong>
            <span>
              {feature.start}-{feature.end}
            </span>
          </div>
        ))}
        {features.length === 0 ? <span className="protein-fallback">No canonical motifs found in current candidate.</span> : null}
      </div>
    </div>
  );
}
