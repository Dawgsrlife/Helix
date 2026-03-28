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
      className="w-8 h-8 rounded-lg bg-[#1b1b1d] hover:bg-[#222224] flex items-center justify-center text-[#6b6b6b] hover:text-[#8a8a8a] transition-colors"
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
          { color: "#5bb5a2", label: ">90" },
          { color: "#6b9fd4", label: ">70" },
          { color: "#c9a855", label: ">50" },
          { color: "#d47a7a", label: "<50" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-[#4a4a4a] font-mono">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
