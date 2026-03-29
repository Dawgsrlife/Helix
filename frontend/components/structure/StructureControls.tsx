"use client";

import { RotateCcw, Crosshair, Palette } from "lucide-react";

interface StructureControlsProps {
  onReset: () => void;
  onHighlight: () => void;
  onToggleColorMode?: () => void;
  colorMode?: "confidence" | "chain";
}

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] hover:bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-muted)] transition-colors"
    >
      {children}
    </button>
  );
}

export default function StructureControls({
  onReset,
  onHighlight,
  onToggleColorMode,
}: StructureControlsProps) {
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <IconButton onClick={onHighlight} label="Highlight selected residue">
        <Crosshair size={14} />
      </IconButton>
      <IconButton onClick={onReset} label="Reset view">
        <RotateCcw size={14} />
      </IconButton>
      {onToggleColorMode && (
        <IconButton onClick={onToggleColorMode} label="Toggle color mode">
          <Palette size={14} />
        </IconButton>
      )}

      {/* pLDDT legend */}
      <div className="flex items-center gap-2 ml-auto">
        {[
          { color: "var(--accent)", label: ">90" },
          { color: "var(--base-c)", label: ">70" },
          { color: "var(--base-g)", label: ">50" },
          { color: "var(--base-t)", label: "<50" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-[var(--text-faint)] font-mono">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
