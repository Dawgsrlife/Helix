"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna, Sparkles, X, ChevronRight, ChevronLeft,
  MousePointerClick, FlaskConical, Box, Search, Pencil, Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useHelixStore } from "@/lib/store";

/* ─── Steps: each waits for a condition before allowing "Next" ─── */

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  /** What the user should do — shown as a highlighted instruction */
  action: string | null;
  icon: LucideIcon;
  /** Step auto-advances when this condition becomes true */
  waitFor?: (state: { viewMode: string; hasAnalysis: boolean }) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Helix",
    description: "Helix is a genomic design IDE powered by AI. Let's walk through the full workflow together — with real data.",
    action: null,
    icon: Dna,
  },
  {
    id: "submit",
    title: "Submit a Sequence",
    description: "Scroll down and click one of the example sequences (like BRCA1 or E. coli lacZ) to start an analysis. Or paste your own DNA sequence and hit Analyze.",
    action: "Click an example sequence below to begin",
    icon: MousePointerClick,
    waitFor: (s) => s.viewMode === "pipeline" || s.hasAnalysis,
  },
  {
    id: "pipeline",
    title: "AI Pipeline Running",
    description: "Evo 2 is scoring every position in your sequence. ESMFold is predicting the protein structure. This takes a few seconds.",
    action: "Waiting for analysis to complete...",
    icon: FlaskConical,
    waitFor: (s) => s.hasAnalysis,
  },
  {
    id: "overview",
    title: "Analysis Overview",
    description: "Here's the big picture — your sequence length, predicted proteins, and per-position confidence scores. Explore the summary cards on the right.",
    action: "Click \"3D Structure\" in the header bar above",
    icon: Dna,
    waitFor: (s) => s.viewMode === "structure",
  },
  {
    id: "structure",
    title: "3D Protein Structure",
    description: "This is the predicted 3D shape of the protein encoded by your DNA. Each sphere is one amino acid. Hover to see confidence scores — teal means very reliable, coral means uncertain.",
    action: "Try hovering over residues, then click \"Explorer\" in the header",
    icon: Box,
    waitFor: (s) => s.viewMode === "explorer",
  },
  {
    id: "explorer",
    title: "Sequence Explorer",
    description: "Every colored letter is a DNA base (A, T, C, G). Click any base to inspect it — the right panel shows its position, type, and the AI's confidence score for that position.",
    action: "Click a few bases, then click \"Design Studio\" in the header",
    icon: Search,
    waitFor: (s) => s.viewMode === "ide",
  },
  {
    id: "studio",
    title: "Design Studio",
    description: "This is where you edit. Enter a position number in the Mutation Editor (right panel), pick a different base (A/T/C/G), and click \"Run simulation\". The AI instantly predicts the impact of your change.",
    action: "Try running a mutation simulation",
    icon: Pencil,
  },
  {
    id: "theme",
    title: "Light & Dark Mode",
    description: "You can toggle between dark and light mode using the button in the sidebar (bottom-left). Both themes are fully supported.",
    action: null,
    icon: Sun,
  },
  {
    id: "helio",
    title: "Ask Helio Anything",
    description: "See the Helio button in the bottom-right? Click it anytime to ask questions in plain English — it understands your analysis and can explain any metric or suggest edits.",
    action: null,
    icon: Sparkles,
  },
];

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
  const viewMode = useHelixStore((s) => s.viewMode);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const totalSteps = STEPS.length;
  const step = STEPS[currentStep];

  // Snapshot of waitFor condition when step was entered
  const [conditionMetOnEntry, setConditionMetOnEntry] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setConditionMetOnEntry(false);
      onViewChange("input");
    }
  }, [isOpen, onViewChange]);

  // When step changes, snapshot whether its condition is already met
  useEffect(() => {
    if (!step.waitFor) {
      setConditionMetOnEntry(false);
      return;
    }
    const state = { viewMode, hasAnalysis: !!analysisResult };
    setConditionMetOnEntry(step.waitFor(state));
    // Only run on step change, not on every state update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Auto-advance only on transition: was false on entry → now true
  useEffect(() => {
    if (!isOpen || !step.waitFor || conditionMetOnEntry) return;
    const state = { viewMode, hasAnalysis: !!analysisResult };
    if (step.waitFor(state)) {
      const timer = setTimeout(() => setCurrentStep((s) => s + 1), 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, viewMode, analysisResult, step, conditionMetOnEntry]);

  const completeTutorial = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "true"); } catch {}
    onViewChange("input");
    onClose();
  }, [onClose, onViewChange]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
    else completeTutorial();
  }, [currentStep, totalSteps, completeTutorial]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  // Keyboard
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

  if (!isOpen) return null;

  const IconComp = step.icon;
  const isWaiting = !!step.waitFor && !step.waitFor({ viewMode, hasAnalysis: !!analysisResult });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        style={{ position: "fixed", bottom: 24, left: 240, zIndex: 9999, width: 400 }}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ type: "spring" as const, stiffness: 400, damping: 28 }}
      >
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--ghost-border)",
            boxShadow: "0 20px 60px oklch(0 0 0 / 0.45), 0 0 0 1px oklch(1 0 0 / 0.04)",
          }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-2">
            <div
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "color-mix(in oklch, var(--accent), transparent 85%)", color: "var(--accent)" }}
            >
              <IconComp size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-label uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  {currentStep + 1} / {totalSteps}
                </span>
                <button onClick={completeTutorial} className="p-1 rounded-md transition-colors hover:bg-white/5">
                  <X size={14} style={{ color: "var(--text-faint)" }} />
                </button>
              </div>
              <h3 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {step.title}
              </h3>
            </div>
          </div>

          {/* Description */}
          <div className="px-5 pb-3">
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {step.description}
            </p>
          </div>

          {/* Action hint — the key instruction */}
          {step.action && (
            <div className="mx-5 mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
              style={{ background: "color-mix(in oklch, var(--accent), transparent 92%)", border: "1px solid color-mix(in oklch, var(--accent), transparent 80%)" }}>
              {isWaiting ? (
                <div className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin shrink-0" />
              ) : (
                <MousePointerClick size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              )}
              <span className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                {step.action}
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--ghost-border)" }}>
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="transition-all duration-200"
                  style={{
                    width: i === currentStep ? 14 : 5,
                    height: 5,
                    borderRadius: 3,
                    background: i === currentStep ? "var(--accent)"
                      : i < currentStep ? "oklch(0.72 0.12 175 / 0.4)"
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
              {!isWaiting && (
                <button onClick={handleNext}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "var(--accent)", color: "var(--surface-void)" }}>
                  {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
                  {currentStep < totalSteps - 1 && <ChevronRight size={12} />}
                </button>
              )}
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
