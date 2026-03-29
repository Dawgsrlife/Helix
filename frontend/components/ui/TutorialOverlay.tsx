"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna,
  Type,
  Cpu,
  BarChart3,
  Box,
  Search,
  Pencil,
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* -------------------------------------------------- */
/*  Tutorial step definitions                         */
/* -------------------------------------------------- */

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetView: string | null;
  /** CSS selector for the element to anchor the coach mark to */
  anchor: string | null;
  /** Position of the coach mark relative to the anchor */
  position: "bottom" | "right" | "left" | "top";
  icon: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Helix",
    description:
      "Helix is a genomic design IDE powered by AI. Analyze DNA, predict protein structures, and design new sequences \u2014 no biology degree required.",
    targetView: "input",
    anchor: null,
    position: "bottom",
    icon: "dna",
  },
  {
    id: "input",
    title: "Start with a Sequence",
    description:
      "Paste a DNA sequence or describe what you want to design in plain English. Try one of the examples to get started!",
    targetView: "input",
    anchor: "[data-tutorial='sequence-input']",
    position: "bottom",
    icon: "type",
  },
  {
    id: "pipeline",
    title: "AI Pipeline",
    description:
      "Multiple AI models analyze your sequence in real-time. Evo 2 scores every position, ESMFold predicts protein shape, and specialized models assess safety.",
    targetView: "pipeline",
    anchor: null,
    position: "bottom",
    icon: "cpu",
  },
  {
    id: "analyze",
    title: "Analysis Overview",
    description:
      "See the big picture: coding regions (exons), non-coding regions (introns), and how confident the AI is about each region.",
    targetView: "analyze",
    anchor: null,
    position: "bottom",
    icon: "bar-chart-3",
  },
  {
    id: "structure",
    title: "3D Protein Structure",
    description:
      "See how your DNA folds into a real protein. Hover residues for confidence scores. Teal = very sure, coral = uncertain.",
    targetView: "structure",
    anchor: null,
    position: "bottom",
    icon: "box",
  },
  {
    id: "explorer",
    title: "Sequence Explorer",
    description:
      "Click any DNA base to see its position, annotation, and likelihood score. The graph shows AI confidence at every position.",
    targetView: "explorer",
    anchor: null,
    position: "bottom",
    icon: "search",
  },
  {
    id: "studio",
    title: "Design Studio",
    description:
      "Select a position, pick a new base, simulate the mutation. See how changes affect function and structure instantly.",
    targetView: "ide",
    anchor: null,
    position: "bottom",
    icon: "pencil",
  },
  {
    id: "helio",
    title: "Ask Helio Anything",
    description:
      "Click the Helio button to ask questions in plain English. It explains metrics, suggests edits, and helps you understand results.",
    targetView: null,
    anchor: null,
    position: "bottom",
    icon: "sparkles",
  },
];

/* -------------------------------------------------- */
/*  Icon map                                          */
/* -------------------------------------------------- */

const ICON_MAP: Record<string, LucideIcon> = {
  dna: Dna,
  type: Type,
  cpu: Cpu,
  "bar-chart-3": BarChart3,
  box: Box,
  search: Search,
  pencil: Pencil,
  sparkles: Sparkles,
};

/* -------------------------------------------------- */
/*  Props                                             */
/* -------------------------------------------------- */

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onViewChange: (view: string) => void;
  currentView: string;
}

/* -------------------------------------------------- */
/*  localStorage key                                  */
/* -------------------------------------------------- */

const LS_KEY = "helix-tutorial-completed";

/* -------------------------------------------------- */
/*  Component                                         */
/* -------------------------------------------------- */

export default function TutorialOverlay({
  isOpen,
  onClose,
  onViewChange,
}: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const totalSteps = TUTORIAL_STEPS.length;
  const step = TUTORIAL_STEPS[currentStep];

  // Reset step when overlay re-opens
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  // Navigate the app view when the tutorial step changes
  useEffect(() => {
    if (!isOpen) return;
    if (step.targetView) onViewChange(step.targetView);
  }, [currentStep, isOpen, step.targetView, onViewChange]);

  // Measure anchor element position
  useEffect(() => {
    if (!isOpen || !step.anchor) {
      setAnchorRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector(step.anchor!);
      if (el) setAnchorRect(el.getBoundingClientRect());
      else setAnchorRect(null);
    };

    const timer = setTimeout(measure, 200);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, step.anchor, currentStep]);

  const completeTutorial = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "true"); } catch {}
    onClose();
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
    else completeTutorial();
  }, [currentStep, totalSteps, completeTutorial]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  // Keyboard nav
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

  // Compute card position based on anchor
  const getCardStyle = (): React.CSSProperties => {
    if (!anchorRect) {
      // No anchor — position at bottom-left as a floating coach mark
      return {
        position: "fixed",
        bottom: 24,
        left: 240, // right of sidebar
        zIndex: 9999,
      };
    }

    const pos = step.position;
    const gap = 12;

    if (pos === "bottom") {
      return {
        position: "fixed",
        top: Math.min(anchorRect.bottom + gap, window.innerHeight - 280),
        left: Math.max(anchorRect.left, 240),
        zIndex: 9999,
      };
    }
    if (pos === "right") {
      return {
        position: "fixed",
        top: anchorRect.top,
        left: anchorRect.right + gap,
        zIndex: 9999,
      };
    }
    if (pos === "left") {
      return {
        position: "fixed",
        top: anchorRect.top,
        right: window.innerWidth - anchorRect.left + gap,
        zIndex: 9999,
      };
    }
    // top
    return {
      position: "fixed",
      bottom: window.innerHeight - anchorRect.top + gap,
      left: Math.max(anchorRect.left, 240),
      zIndex: 9999,
    };
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Subtle highlight ring around anchor element (no dark backdrop) */}
      {anchorRect && (
        <motion.div
          className="fixed pointer-events-none"
          style={{
            left: anchorRect.left - 6,
            top: anchorRect.top - 6,
            width: anchorRect.width + 12,
            height: anchorRect.height + 12,
            borderRadius: 10,
            border: "2px solid var(--accent)",
            boxShadow: "0 0 0 4px oklch(0.72 0.12 175 / 0.15), 0 0 20px oklch(0.72 0.12 175 / 0.1)",
            zIndex: 9998,
          }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 25 }}
        />
      )}

      {/* Coach mark card — floating, no backdrop */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={cardRef}
          style={{ ...getCardStyle(), width: 360 }}
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
              boxShadow: "0 16px 48px oklch(0 0 0 / 0.35), 0 0 0 1px oklch(1 0 0 / 0.04)",
            }}
          >
            {/* Arrow pointing up when anchored */}
            {anchorRect && step.position === "bottom" && (
              <div
                style={{
                  position: "absolute",
                  top: -6,
                  left: 32,
                  width: 12,
                  height: 12,
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--ghost-border)",
                  borderRight: "none",
                  borderBottom: "none",
                  transform: "rotate(45deg)",
                }}
              />
            )}

            {/* Header with icon, step counter, close */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-3">
              <div
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "color-mix(in oklch, var(--accent), transparent 88%)", color: "var(--accent)" }}
              >
                <IconComponent size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className="text-[10px] font-label uppercase tracking-wider"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Step {currentStep + 1} of {totalSteps}
                  </span>
                  <button
                    onClick={completeTutorial}
                    className="p-1 rounded-md transition-colors hover:bg-white/5"
                    aria-label="Close tutorial"
                  >
                    <X size={14} style={{ color: "var(--text-faint)" }} />
                  </button>
                </div>
                <h3
                  className="text-sm font-semibold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {step.title}
                </h3>
              </div>
            </div>

            {/* Description */}
            <div className="px-5 pb-4">
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {step.description}
              </p>
            </div>

            {/* Footer: progress + navigation */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--ghost-border)" }}
            >
              {/* Progress dots */}
              <div className="flex items-center gap-1">
                {TUTORIAL_STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setCurrentStep(i)}
                    aria-label={`Step ${i + 1}`}
                    className="transition-all duration-200"
                    style={{
                      width: i === currentStep ? 14 : 5,
                      height: 5,
                      borderRadius: 3,
                      background:
                        i === currentStep
                          ? "var(--accent)"
                          : i < currentStep
                            ? "oklch(0.72 0.12 175 / 0.35)"
                            : "var(--ghost-border)",
                    }}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={completeTutorial}
                  className="text-[10px] px-2 py-1 transition-colors hover:underline"
                  style={{ color: "var(--text-faint)" }}
                >
                  Skip
                </button>
                {currentStep > 0 && (
                  <button
                    onClick={handleBack}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-white/5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <ChevronLeft size={12} /> Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "var(--accent)", color: "var(--surface-void)" }}
                >
                  {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
                  {currentStep < totalSteps - 1 && <ChevronRight size={12} />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/* -------------------------------------------------- */
/*  Utility: check if tutorial was completed before   */
/* -------------------------------------------------- */

export function isTutorialCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(LS_KEY) === "true";
  } catch {
    return false;
  }
}

export function resetTutorialCompleted(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}
