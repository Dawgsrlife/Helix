"use client";

/**
 * Skeleton loading placeholders that match Helix panel patterns.
 * Uses the .skeleton class from globals.css (shimmer animation).
 */

export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="skeleton h-3 rounded"
      style={{ width }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ height = "120px" }: { height?: string }) {
  return (
    <div
      className="skeleton rounded-lg w-full"
      style={{ height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonScoreRow() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="skeleton h-2.5 w-14 rounded" />
      <div className="skeleton flex-1 h-1.5 rounded-full" />
      <div className="skeleton h-2.5 w-8 rounded" />
    </div>
  );
}

export function SkeletonPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="p-5 space-y-3 rounded-xl"
      style={{ background: "var(--surface-elevated)" }}
      role="status"
      aria-label="Loading"
    >
      <SkeletonLine width="40%" />
      <div className="space-y-2.5 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonScoreRow key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonSequence() {
  return (
    <div
      className="space-y-2 p-4"
      role="status"
      aria-label="Loading sequence"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonLine key={i} width={i === 5 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
