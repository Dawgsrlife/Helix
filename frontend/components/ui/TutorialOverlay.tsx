"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna, Sparkles, X, ChevronRight, ChevronLeft,
  MousePointerClick, FlaskConical, Box, Search, Pencil, Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useHelixStore } from "@/lib/store";

/* ─── Steps ─── */

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  action: string | null;
  icon: LucideIcon;
  /** CSS selector to highlight — ring appears around this element */
  highlight?: string;
  /** Where to position the card relative to highlighted element */
  cardPosition?: "top-right" | "bottom-left";
  /** Auto-advance when this returns true (blocks Next button until met) */
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
    description: "Scroll down and click one of the example sequences to start an analysis — or paste your own DNA and click Analyze.",
    action: "Click an example sequence to begin",
    icon: MousePointerClick,
    highlight: "[data-tutorial='sequence-input']",
    waitFor: (s) => s.viewMode === "pipeline" || s.hasAnalysis,
  },
  {
    id: "pipeline",
    title: "AI Pipeline Running",
    description: "Evo 2 is scoring every position. ESMFold is predicting the protein structure. This takes a few seconds.",
    action: "Waiting for analysis to complete...",
    icon: FlaskConical,
    waitFor: (s) => s.hasAnalysis,
  },
  {
    id: "overview",
    title: "Analysis Overview",
    description: "Here's the big picture — your sequence scores, predicted proteins, and confidence metrics. Look around, then navigate to the 3D structure.",
    action: "Click \"3D STRUCTURE\" in the header bar",
    icon: Dna,
    waitFor: (s) => s.viewMode === "structure",
  },
  {
    id: "structure",
    title: "3D Protein Structure",
    description: "This is the predicted 3D shape of your protein. Each sphere is one amino acid. Hover for confidence scores — teal is reliable, coral is uncertain.",
    action: "Hover some residues, then click \"EXPLORER\" in the header",
    icon: Box,
    waitFor: (s) => s.viewMode === "explorer",
  },
  {
    id: "explorer",
    title: "Sequence Explorer",
    description: "Every colored letter is a DNA base. Click any base to inspect it — the right panel shows position, type, and the AI's confidence score.",
    action: "Click a few bases, then click \"DESIGN STUDIO\"",
    icon: Search,
    waitFor: (s) => s.viewMode === "ide",
  },
  {
    id: "studio",
    title: "Design Studio",
    description: "Enter a position number, pick a different base (A/T/C/G), and click \"Run simulation\". The AI predicts the impact of your edit in real time.",
    action: "Try running a mutation simulation",
    icon: Pencil,
  },
  {
    id: "theme",
    title: "Customize Your View",
    description: "Toggle between dark and light mode using the sidebar button. Both themes are fully supported across all views.",
    action: null,
    icon: Sun,
  },
  {
    id: "helio",
    title: "Ask Helio Anything",
    description: "See the Helio button (bottom-right)? Click it anytime to ask questions in plain English. Helio is powered by Gemini and understands your full analysis context.",
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

/* ─── Highlight ring component ─── */

function HighlightRing({ selector }: { selector?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    const t = setTimeout(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [selector]);

  if (!rect) return null;

  return (
    <motion.div
      className="fixed pointer-events-none"
      style={{
        left: rect.left - 4, top: rect.top - 4,
        width: rect.width + 8, height: rect.height + 8,
        borderRadius: 8,
        border: "2px solid var(--accent)",
        boxShadow: "0 0 0 4000px oklch(0 0 0 / 0.3), 0 0 16px oklch(0.72 0.12 175 / 0.3)",
        zIndex: 9998,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    />
  );
}

/* ─── Component ─── */

export default function TutorialOverlay({ isOpen, onClose, onViewChange }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const viewMode = useHelixStore((s) => s.viewMode);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const totalSteps = STEPS.length;
  const step = STEPS[currentStep];

  const [conditionMetOnEntry, setConditionMetOnEntry] = useState(false);

  useEffect(() => {
    if (isOpen) { setCurrentStep(0); setConditionMetOnEntry(false); onViewChange("input"); }
  }, [isOpen, onViewChange]);

  // Snapshot waitFor on step entry
  useEffect(() => {
    if (!step.waitFor) { setConditionMetOnEntry(false); return; }
    setConditionMetOnEntry(step.waitFor({ viewMode, hasAnalysis: !!analysisResult }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Auto-advance on false→true transition
  useEffect(() => {
    if (!isOpen || !step.waitFor || conditionMetOnEntry) return;
    if (step.waitFor({ viewMode, hasAnalysis: !!analysisResult })) {
      const t = setTimeout(() => setCurrentStep((s) => s + 1), 500);
      return () => clearTimeout(t);
    }
  }, [isOpen, viewMode, analysisResult, step, conditionMetOnEntry]);

  const completeTutorial = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "true"); } catch {}
    onViewChange("input");
    onClose();
  }, [onClose, onViewChange]);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => s < STEPS.length - 1 ? s + 1 : s);
    if (currentStep >= totalSteps - 1) completeTutorial();
  }, [currentStep, totalSteps, completeTutorial]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => s > 0 ? s - 1 : s);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); completeTutorial(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, completeTutorial]);

  if (!isOpen) return null;

  const IconComp = step.icon;
  const isWaiting = !!step.waitFor && !conditionMetOnEntry && !step.waitFor({ viewMode, hasAnalysis: !!analysisResult });
  const canProceed = !step.waitFor || !isWaiting;

  return (
    <>
      {/* Highlight ring on target element */}
      <HighlightRing selector={step.highlight} />

      {/* Card — positioned top-right to stay out of the way */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          style={{ position: "fixed", top: 72, right: 24, zIndex: 9999, width: 380 }}
          initial={{ opacity: 0, x: 20, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.96 }}
          transition={{ type: "spring" as const, stiffness: 400, damping: 28 }}
        >
          <div className="rounded-xl overflow-hidden"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--ghost-border)",
              boxShadow: "0 20px 60px oklch(0 0 0 / 0.5)",
            }}>
            {/* Header */}
            <div className="flex items-start gap-3 px-5 pt-4 pb-2">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "color-mix(in oklch, var(--accent), transparent 85%)", color: "var(--accent)" }}>
                <IconComp size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-label uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                    {currentStep + 1} / {totalSteps}
                  </span>
                  <button onClick={completeTutorial} className="p-1 rounded-md transition-colors hover:bg-white/5">
                    <X size={13} style={{ color: "var(--text-faint)" }} />
                  </button>
                </div>
                <h3 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {step.title}
                </h3>
              </div>
            </div>

            {/* Description */}
            <div className="px-5 pb-2">
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {step.description}
              </p>
            </div>

            {/* Action hint */}
            {step.action && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
                style={{ background: "color-mix(in oklch, var(--accent), transparent 92%)" }}>
                {isWaiting ? (
                  <div className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin shrink-0" />
                ) : (
                  <MousePointerClick size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                )}
                <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                  {step.action}
                </span>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--ghost-border)" }}>
              <div className="flex items-center gap-0.5">
                {STEPS.map((_, i) => (
                  <div key={i} className="transition-all duration-200"
                    style={{
                      width: i === currentStep ? 12 : 4, height: 4, borderRadius: 2,
                      background: i === currentStep ? "var(--accent)" : i < currentStep ? "oklch(0.72 0.12 175 / 0.4)" : "var(--ghost-border)",
                    }} />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={completeTutorial} className="text-[10px] px-2 py-1 hover:underline" style={{ color: "var(--text-faint)" }}>
                  Skip
                </button>
                {currentStep > 0 && (
                  <button onClick={handleBack}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium hover:bg-white/5"
                    style={{ color: "var(--text-secondary)" }}>
                    <ChevronLeft size={11} /> Back
                  </button>
                )}
                {canProceed && (
                  <button onClick={handleNext}
                    className="inline-flex items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] font-semibold hover:brightness-110 active:scale-[0.97]"
                    style={{ background: "var(--accent)", color: "var(--surface-void)" }}>
                    {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
                    {currentStep < totalSteps - 1 && <ChevronRight size={11} />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
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
