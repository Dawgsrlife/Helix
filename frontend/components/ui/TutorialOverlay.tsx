"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna, Type, Cpu, BarChart3, Box, Search, Pencil, Sparkles,
  X, ChevronRight, ChevronLeft, Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── Tutorial steps — none navigate away from the current view ─── */

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Helix",
    description: "Helix is a genomic design IDE powered by AI. Analyze DNA, predict protein structures, and design new sequences — no biology degree required. Let's walk through what you can do.",
    icon: "dna",
  },
  {
    id: "input",
    title: "Start with a Sequence",
    description: "Paste a DNA sequence (like ATCGATCG...) or describe what you want to design in plain English. Try one of the example sequences to get started quickly.",
    icon: "type",
  },
  {
    id: "pipeline",
    title: "AI Pipeline",
    description: "When you submit, multiple AI models analyze your sequence in real-time. Evo 2 scores every position, ESMFold predicts protein shape, and specialized models assess safety and function.",
    icon: "cpu",
  },
  {
    id: "views",
    title: "Explore Your Results",
    description: "After analysis, use the tabs in the header bar to navigate: Overview shows the big picture, 3D Structure shows the predicted protein, Explorer lets you inspect individual bases, and Design Studio lets you edit.",
    icon: "bar-chart-3",
  },
  {
    id: "structure",
    title: "3D Protein Structure",
    description: "The Structure view shows how your DNA would fold into a real protein. Hover any residue sphere for its confidence score. Colors: teal = very confident, blue = good, amber = uncertain, coral = low confidence.",
    icon: "box",
  },
  {
    id: "studio",
    title: "Edit & Simulate",
    description: "In Design Studio, click a base, pick a new one, and simulate the mutation. The AI instantly predicts how the change affects protein function — showing you the delta log-likelihood and impact classification.",
    icon: "pencil",
  },
  {
    id: "theme",
    title: "Customize Your View",
    description: "Toggle between dark and light mode using the button in the sidebar. Both themes are fully supported across all views.",
    icon: "sun",
  },
  {
    id: "helio",
    title: "Ask Helio Anything",
    description: "Not sure what a score means? Click the Helio button (bottom-right) to ask questions in plain English. Helio understands your analysis context and can explain metrics, suggest edits, or help you interpret results.",
    icon: "sparkles",
  },
];

/* ─── Icon map ─── */

const ICON_MAP: Record<string, LucideIcon> = {
  dna: Dna, type: Type, cpu: Cpu, "bar-chart-3": BarChart3,
  box: Box, search: Search, pencil: Pencil, sparkles: Sparkles, sun: Sun,
};

/* ─── Props ─── */

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onViewChange: (view: string) => void;
  currentView: string;
}

const LS_KEY = "helix-tutorial-completed";

/* ─── Component ─── */

export default function TutorialOverlay({
  isOpen,
  onClose,
  onViewChange,
}: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = TUTORIAL_STEPS.length;
  const step = TUTORIAL_STEPS[currentStep];

  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  const completeTutorial = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "true"); } catch {}
    onViewChange("input"); // Go back to Home on finish
    onClose();
  }, [onClose, onViewChange]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
    else completeTutorial();
  }, [currentStep, totalSteps, completeTutorial]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); handleNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); handleBack(); }
      else if (e.key === "Escape") { e.preventDefault(); completeTutorial(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleNext, handleBack, completeTutorial]);

  const IconComponent = ICON_MAP[step.icon] ?? Dna;

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        style={{
          position: "fixed",
          bottom: 24,
          left: 240,
          zIndex: 9999,
          width: 380,
        }}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: "spring" as const, stiffness: 400, damping: 30 }}
      >
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--ghost-border)",
            boxShadow: "0 16px 48px oklch(0 0 0 / 0.4), 0 0 0 1px oklch(1 0 0 / 0.04)",
          }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "color-mix(in oklch, var(--accent), transparent 88%)", color: "var(--accent)" }}
            >
              <IconComponent size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-label uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  {currentStep + 1} / {totalSteps}
                </span>
                <button onClick={completeTutorial} className="p-1 rounded-md transition-colors hover:bg-white/5" aria-label="Close">
                  <X size={14} style={{ color: "var(--text-faint)" }} />
                </button>
              </div>
              <h3 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {step.title}
              </h3>
            </div>
          </div>

          {/* Description */}
          <div className="px-5 pb-4">
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {step.description}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--ghost-border)" }}>
            <div className="flex items-center gap-1">
              {TUTORIAL_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className="transition-all duration-200"
                  style={{
                    width: i === currentStep ? 14 : 5,
                    height: 5,
                    borderRadius: 3,
                    background: i === currentStep ? "var(--accent)"
                      : i < currentStep ? "oklch(0.72 0.12 175 / 0.35)"
                      : "var(--ghost-border)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={completeTutorial} className="text-[10px] px-2 py-1 transition-colors hover:underline" style={{ color: "var(--text-faint)" }}>
                Skip
              </button>
              {currentStep > 0 && (
                <button onClick={handleBack}
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-white/5"
                  style={{ color: "var(--text-secondary)" }}>
                  <ChevronLeft size={12} /> Back
                </button>
              )}
              <button onClick={handleNext}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                style={{ background: "var(--accent)", color: "var(--surface-void)" }}>
                {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
                {currentStep < totalSteps - 1 && <ChevronRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Utilities ─── */

export function isTutorialCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
}

export function resetTutorialCompleted(): void {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
