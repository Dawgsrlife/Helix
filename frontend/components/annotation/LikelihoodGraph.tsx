"use client";

import { useRef, useEffect, useMemo } from "react";
import type { LikelihoodScore } from "@/types";

interface LikelihoodGraphProps {
  scores: LikelihoodScore[];
  highlightedPosition?: number;
  onPositionHover: (position: number) => void;
}

export default function LikelihoodGraph({
  scores,
  highlightedPosition,
  onPositionHover,
}: LikelihoodGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxAbsScore = useMemo(
    () => Math.max(...scores.map((s) => Math.abs(s.score)), 1),
    [scores]
  );

  // Canvas-based rendering for performance with thousands of positions
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || scores.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barWidth = Math.max(w / scores.length, 1);

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      const barHeight = (Math.abs(score.score) / maxAbsScore) * (h - 4);
      const x = (i / scores.length) * w;
      const y = h - barHeight;

      const isHighlighted = score.position === highlightedPosition;

      if (isHighlighted) {
        ctx.fillStyle = "#e5e1e4";
      } else {
        ctx.fillStyle = "rgba(91, 181, 162, 0.50)";
      }

      ctx.fillRect(x, y, Math.max(barWidth - 0.5, 0.5), barHeight);
    }

    // Highlight line
    if (highlightedPosition !== undefined && highlightedPosition < scores.length) {
      const x = (highlightedPosition / scores.length) * w;
      ctx.strokeStyle = "rgba(229, 225, 228, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [scores, highlightedPosition, maxAbsScore]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || scores.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.floor((x / rect.width) * scores.length);
    if (idx >= 0 && idx < scores.length) {
      onPositionHover(scores[idx].position);
    }
  };

  if (scores.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ color: "var(--text-faint)", fontSize: "12px" }}
      >
        No likelihood data
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-1.5">
        <span
          className="select-none uppercase tracking-wider"
          style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 600, letterSpacing: "0.05em" }}
        >
          Log-likelihood
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-faint)", fontFamily: "var(--font-mono, monospace)" }}>
          {scores.length} pos
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 cursor-crosshair"
        onMouseMove={handleMouseMove}
        style={{ backgroundColor: "var(--surface-void)", borderRadius: "3px", minHeight: "80px" }}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}
