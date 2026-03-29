"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dna, Sparkles, X, ChevronRight, ChevronLeft,
  FlaskConical, Box, Search, Pencil, Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useHelixStore } from "@/lib/store";

/* ─── Steps ─── */

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Auto-advance to next step when this returns true */
  advanceWhen?: (state: { viewMode: string; hasAnalysis: boolean }) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Helix",
    description: "Let's walk through the workflow. Click an example sequence below (or paste your own), then hit Analyze.",
    icon: Dna,
  },
  {
    id: "analyzing",
    title: "Analyzing...",
    description: "The AI pipeline is running — Evo 2 scores every position, ESMFold predicts protein structure.",
    icon: FlaskConical,
    advanceWhen: (s) => s.hasAnalysis,
  },
  {
    id: "overview",
    title: "Results Ready",
    description: "Your analysis is complete. Explore the scores and summary, then try clicking \"3D STRUCTURE\" in the header.",
    icon: Dna,
    advanceWhen: (s) => s.viewMode === "structure",
  },
  {
    id: "structure",
    title: "3D Protein Structure",
    description: "Hover any sphere to see its confidence score. Click \"EXPLORER\" in the header to inspect individual DNA bases.",
    icon: Box,
    advanceWhen: (s) => s.viewMode === "explorer",
  },
  {
    id: "explorer",
    title: "Sequence Explorer",
    description: "Click any colored base to inspect it. Then try \"DESIGN STUDIO\" to edit bases and simulate mutations.",
    icon: Search,
    advanceWhen: (s) => s.viewMode === "ide",
  },
  {
    id: "studio",
    title: "Design Studio",
    description: "Enter a position, pick a target base, click \"Run simulation\" to see the predicted impact. Try the light/dark toggle in the sidebar too.",
    icon: Pencil,
  },
  {
    id: "helio",
    title: "Ask Helio",
    description: "Click the Helio button (bottom-right) anytime to ask questions about your analysis in plain English.",
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

export default function TutorialOverlay({ isOpen, onClose, onViewChange }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const viewMode = useHelixStore((s) => s.viewMode);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const step = STEPS[currentStep];

  // Reset on open
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  // Auto-advance: watch for condition becoming true AFTER entering the step
  const [wasMetOnEntry, setWasMetOnEntry] = useState(false);

  useEffect(() => {
    if (!step.advanceWhen) { setWasMetOnEntry(false); return; }
    const met = step.advanceWhen({ viewMode, hasAnalysis: !!analysisResult });
    setWasMetOnEntry(met);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  useEffect(() => {
    if (!isOpen || !step.advanceWhen || wasMetOnEntry) return;
    if (step.advanceWhen({ viewMode, hasAnalysis: !!analysisResult })) {
      const t = setTimeout(() => setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1)), 400);
      return () => clearTimeout(t);
    }
  }, [isOpen, viewMode, analysisResult, step, wasMetOnEntry]);

  // Also auto-advance step 0→1 when pipeline starts
  useEffect(() => {
    if (!isOpen || currentStep !== 0) return;
    if (viewMode === "pipeline") {
      setCurrentStep(1);
    }
  }, [isOpen, currentStep, viewMode]);

  const finish = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "true"); } catch {}
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
    else finish();
  }, [currentStep, finish]);

  const back = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); finish(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, finish]);

  if (!isOpen) return null;

  const IconComp = step.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        // Positioned top-right, pointer-events only on the card itself
        style={{ position: "fixed", top: 72, right: 16, zIndex: 9999, width: 340, pointerEvents: "auto" }}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={{ type: "spring" as const, stiffness: 400, damping: 28 }}
      >
        <div className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--ghost-border)",
            boxShadow: "0 12px 40px oklch(0 0 0 / 0.4)",
          }}>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1.5">
            <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: "color-mix(in oklch, var(--accent), transparent 85%)", color: "var(--accent)" }}>
              <IconComp size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-label uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {currentStep + 1}/{STEPS.length}
              </span>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {step.title}
              </h3>
            </div>
            <button onClick={finish} className="p-1 rounded hover:bg-white/5">
              <X size={13} style={{ color: "var(--text-faint)" }} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 pb-3">
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {step.description}
            </p>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: "1px solid var(--ghost-border)" }}>
            <div className="flex gap-0.5">
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  width: i === currentStep ? 10 : 4, height: 4, borderRadius: 2,
                  background: i === currentStep ? "var(--accent)" : i < currentStep ? "oklch(0.72 0.12 175 / 0.4)" : "var(--ghost-border)",
                  transition: "all 0.2s",
                }} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={finish} className="text-[10px] px-1.5 py-0.5 hover:underline" style={{ color: "var(--text-faint)" }}>Skip</button>
              {currentStep > 0 && (
                <button onClick={back} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/5" style={{ color: "var(--text-secondary)" }}>
                  <ChevronLeft size={11} className="inline" /> Back
                </button>
              )}
              <button onClick={next}
                className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded text-[10px] font-semibold hover:brightness-110"
                style={{ background: "var(--accent)", color: "var(--surface-void)" }}>
                {currentStep === STEPS.length - 1 ? "Done" : "Next"} {currentStep < STEPS.length - 1 && <ChevronRight size={10} />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function isTutorialCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
}

export function resetTutorialCompleted(): void {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
