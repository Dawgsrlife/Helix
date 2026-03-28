"use client";

interface StructureControlsProps {
  onReset: () => void;
  onHighlight: () => void;
}

export default function StructureControls({
  onReset,
  onHighlight,
}: StructureControlsProps) {
  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={onHighlight}
        className="px-3 py-1 text-xs rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] transition-colors"
      >
        Highlight Selected
      </button>
      <button
        onClick={onReset}
        className="px-3 py-1 text-xs rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] transition-colors"
      >
        Reset View
      </button>
    </div>
  );
}
