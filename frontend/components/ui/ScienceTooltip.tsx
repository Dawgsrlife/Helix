"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReactDOM from "react-dom";

// ---------------------------------------------------------------------------
// Dictionary of scientific terms with plain-English explanations.
// Keys are kebab-case identifiers used throughout the Helix UI.
// ---------------------------------------------------------------------------

export const SCIENCE_TERMS: Record<
  string,
  { title: string; explanation: string; learnMore?: string }
> = {
  // ── Scores & metrics ─────────────────────────────────────────────────────
  plddt: {
    title: "pLDDT Score",
    explanation:
      "A confidence score from 0\u2013100 that tells you how sure the AI is about each part of a protein\u2019s predicted 3D shape. Above 90 is very reliable, below 50 means the prediction is uncertain.",
  },
  "functional-plausibility": {
    title: "Functional Plausibility",
    explanation:
      "How likely this DNA sequence is to produce a working, functional protein. Higher scores mean the sequence follows patterns seen in real, working genes.",
  },
  "tissue-specificity": {
    title: "Tissue Specificity",
    explanation:
      "How well this sequence targets a specific tissue or cell type. A high score means the sequence will mainly work in the intended tissue, not everywhere in the body.",
  },
  "off-target-risk": {
    title: "Off-Target Risk",
    explanation:
      "The chance this sequence could accidentally affect genes other than the intended one. Lower is better \u2014 you want minimal unintended side effects.",
  },
  novelty: {
    title: "Novelty Score",
    explanation:
      "How different this sequence is from known natural sequences. Higher novelty means a more original design, but too high might mean untested territory.",
  },
  "log-likelihood": {
    title: "Log-Likelihood",
    explanation:
      "A score from the Evo 2 AI model that indicates how \u2018natural\u2019 each position in the sequence looks. More negative = less expected. Positions with unusual scores may be functionally important or errors.",
  },
  "gc-content": {
    title: "GC Content",
    explanation:
      "The percentage of bases that are G or C (vs A or T). Most genes have 40\u201360% GC content. Extreme values can cause problems with gene expression or stability.",
  },
  "overall-viability": {
    title: "Overall Viability",
    explanation:
      "A combined score weighing all factors \u2014 function, tissue targeting, safety, and novelty \u2014 to give a single number for how promising this sequence candidate is.",
  },

  // ── DNA / Genomics ───────────────────────────────────────────────────────
  adenine: {
    title: "Adenine (A)",
    explanation:
      "One of the four DNA building blocks (bases). Adenine always pairs with Thymine (T) in double-stranded DNA. It\u2019s like one half of a zipper tooth.",
  },
  thymine: {
    title: "Thymine (T)",
    explanation:
      "One of the four DNA building blocks. Thymine always pairs with Adenine (A). In RNA, Thymine is replaced by Uracil (U).",
  },
  cytosine: {
    title: "Cytosine (C)",
    explanation:
      "One of the four DNA building blocks. Cytosine always pairs with Guanine (G). The C\u2013G bond is stronger than the A\u2013T bond.",
  },
  guanine: {
    title: "Guanine (G)",
    explanation:
      "One of the four DNA building blocks. Guanine always pairs with Cytosine (C). Regions rich in G and C are more structurally stable.",
  },
  "base-pair": {
    title: "Base Pair (bp)",
    explanation:
      "A unit of measurement for DNA length. One base pair is one \u2018rung\u2019 of the DNA ladder \u2014 a single A\u2013T or C\u2013G connection.",
  },

  // ── Regions ──────────────────────────────────────────────────────────────
  exon: {
    title: "Exon",
    explanation:
      "A section of DNA that codes for protein. Think of it as the \u2018useful paragraphs\u2019 in a book \u2014 these parts get read and turned into protein.",
  },
  intron: {
    title: "Intron",
    explanation:
      "A section of DNA between exons that doesn\u2019t code for protein. It gets removed before the gene is used. Like filler pages in a book that get skipped.",
  },
  orf: {
    title: "Open Reading Frame (ORF)",
    explanation:
      "A stretch of DNA that could potentially code for a protein \u2014 it has a start signal and stop signal. Finding ORFs helps identify where genes might be.",
  },
  prophage: {
    title: "Prophage",
    explanation:
      "Viral DNA that has been inserted into a bacterial genome. It\u2019s like a dormant virus hiding in the bacteria\u2019s own genetic code.",
  },
  intergenic: {
    title: "Intergenic Region",
    explanation:
      "DNA between genes \u2014 not part of any known gene. May contain regulatory elements that control when nearby genes turn on or off.",
  },

  // ── Protein structure ────────────────────────────────────────────────────
  "protein-structure": {
    title: "Protein Structure",
    explanation:
      "The 3D shape a protein folds into. Shape determines function \u2014 like a key fitting a lock. AI can now predict these shapes from DNA sequence alone.",
  },
  residue: {
    title: "Residue",
    explanation:
      "A single amino acid in a protein chain. Proteins are chains of residues, typically 100\u20131000 long. Each residue\u2019s position affects the overall 3D shape.",
  },
  "alpha-helix": {
    title: "Alpha Helix",
    explanation:
      "A common protein shape \u2014 a coiled spiral, like a corkscrew. Many proteins contain multiple helices connected by loops.",
  },
  "beta-sheet": {
    title: "Beta Sheet",
    explanation:
      "A flat protein structure where strands line up side by side, like pleated fabric. Often found in structural proteins.",
  },

  // ── Models ───────────────────────────────────────────────────────────────
  evo2: {
    title: "Evo 2",
    explanation:
      "A 40-billion parameter AI model trained on 9 trillion DNA base pairs. It scores how \u2018natural\u2019 a DNA sequence looks \u2014 useful for finding mutations, designing genes, and predicting function.",
  },
  esmfold: {
    title: "ESMFold",
    explanation:
      "An AI model from Meta that predicts protein 3D structure directly from amino acid sequence. Similar to AlphaFold but faster. The pLDDT scores come from this model.",
  },
  alphafold: {
    title: "AlphaFold",
    explanation:
      "Google DeepMind\u2019s breakthrough AI for predicting protein 3D structures. Won the 2024 Nobel Prize in Chemistry. Revolutionized structural biology.",
  },

  // ── Mutations ────────────────────────────────────────────────────────────
  mutation: {
    title: "Mutation",
    explanation:
      "A change in the DNA sequence \u2014 swapping one base for another. Mutations can be harmless (benign), slightly impactful (moderate), or harmful (deleterious).",
  },
  benign: {
    title: "Benign Mutation",
    explanation:
      "A DNA change that has little or no effect on the protein\u2019s function. Most mutations in a genome are benign.",
  },
  deleterious: {
    title: "Deleterious Mutation",
    explanation:
      "A DNA change that significantly harms the protein\u2019s function. These are the mutations most associated with genetic diseases.",
  },
  "delta-likelihood": {
    title: "Delta Likelihood (\u0394LL)",
    explanation:
      "How much a mutation changes the AI\u2019s confidence in the sequence. A large negative change suggests the mutation is harmful; positive means it might improve the sequence.",
  },
};

// ---------------------------------------------------------------------------
// Positioning helpers
// ---------------------------------------------------------------------------

type Side = "top" | "bottom" | "left" | "right";

function getTooltipStyle(
  side: Side,
  triggerRect: DOMRect | null,
): React.CSSProperties {
  if (!triggerRect) return { opacity: 0, pointerEvents: "none" };

  const gap = 8;
  const margin = 12; // min distance from viewport edge
  const tooltipW = 280;
  const tooltipH = 80; // estimated

  const base: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
    maxWidth: tooltipW,
    pointerEvents: "none",
  };

  // Auto-flip if tooltip would go off-screen
  let effectiveSide = side;
  if (side === "top" && triggerRect.top < tooltipH + margin) effectiveSide = "bottom";
  if (side === "bottom" && triggerRect.bottom + tooltipH + gap > window.innerHeight - margin) effectiveSide = "top";
  if (side === "left" && triggerRect.left < tooltipW + margin) effectiveSide = "right";
  if (side === "right" && triggerRect.right + tooltipW + gap > window.innerWidth - margin) effectiveSide = "left";

  // Clamp horizontal center to keep tooltip in viewport
  const centerX = Math.max(tooltipW / 2 + margin, Math.min(triggerRect.left + triggerRect.width / 2, window.innerWidth - tooltipW / 2 - margin));

  switch (effectiveSide) {
    case "top":
      return { ...base, left: centerX, top: triggerRect.top - gap, transform: "translate(-50%, -100%)" };
    case "bottom":
      return { ...base, left: centerX, top: triggerRect.bottom + gap, transform: "translate(-50%, 0)" };
    case "left":
      return { ...base, left: triggerRect.left - gap, top: triggerRect.top + triggerRect.height / 2, transform: "translate(-100%, -50%)" };
    case "right":
      return { ...base, left: triggerRect.right + gap, top: triggerRect.top + triggerRect.height / 2, transform: "translate(0, -50%)" };
  }
}

// ---------------------------------------------------------------------------
// ScienceTooltip
// ---------------------------------------------------------------------------

interface ScienceTooltipProps {
  /** Key into SCIENCE_TERMS, or any string. If not found, children render as-is. */
  term: keyof typeof SCIENCE_TERMS | (string & {});
  children: React.ReactNode;
  className?: string;
  /** Which side to show the tooltip on (default "top"). */
  side?: Side;
}

export function ScienceTooltip({
  term,
  children,
  className,
  side = "top",
}: ScienceTooltipProps) {
  const entry = SCIENCE_TERMS[term];

  // If the term isn't in the dictionary, render children transparently.
  if (!entry) {
    return <>{children}</>;
  }

  return (
    <TooltipShell
      title={entry.title}
      explanation={entry.explanation}
      side={side}
      className={className}
    >
      {children}
    </TooltipShell>
  );
}

// ---------------------------------------------------------------------------
// ScienceInfo  (inline info icon variant)
// ---------------------------------------------------------------------------

interface ScienceInfoProps {
  /** Key into SCIENCE_TERMS. */
  term: keyof typeof SCIENCE_TERMS | (string & {});
  className?: string;
  side?: Side;
}

/**
 * A small info icon that shows the science tooltip on hover.
 * Drop it next to any label:  `<span>pLDDT <ScienceInfo term="plddt" /></span>`
 */
export function ScienceInfo({ term, className, side = "top" }: ScienceInfoProps) {
  const entry = SCIENCE_TERMS[term];
  if (!entry) return null;

  return (
    <TooltipShell
      title={entry.title}
      explanation={entry.explanation}
      side={side}
      className={className}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: "50%",
          border: "1px solid var(--ghost-border)",
          color: "var(--text-muted)",
          cursor: "help",
          verticalAlign: "middle",
          marginLeft: 4,
          transition: "color 0.15s ease, border-color 0.15s ease",
        }}
        aria-label={`Info: ${entry.title}`}
      >
        i
      </span>
    </TooltipShell>
  );
}

// ---------------------------------------------------------------------------
// Shared inner shell that manages hover state + renders the tooltip popup.
// ---------------------------------------------------------------------------

interface TooltipShellProps {
  title: string;
  explanation: string;
  side: Side;
  className?: string;
  children: React.ReactNode;
}

function TooltipShell({
  title,
  explanation,
  side,
  className,
  children,
}: TooltipShellProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 120);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className={className}
        style={{
          borderBottom: "1px dashed var(--text-faint)",
          cursor: "help",
          display: "inline",
        }}
      >
        {children}
      </span>

      {visible && (
        <ScienceTooltipPopup
          title={title}
          explanation={explanation}
          style={getTooltipStyle(side, rect)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The actual floating popup element, rendered via a portal.
// ---------------------------------------------------------------------------

interface PopupProps {
  title: string;
  explanation: string;
  style: React.CSSProperties;
}

function ScienceTooltipPopup({ title, explanation, style }: PopupProps) {
  // We render into a portal so the tooltip escapes any overflow:hidden ancestors.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <div
      style={{
        ...style,
        background: "var(--surface-elevated)",
        border: "1px solid var(--ghost-border)",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow:
          "0 4px 24px oklch(0 0 0 / 0.35), 0 1px 4px oklch(0 0 0 / 0.2)",
        opacity: mounted ? 1 : 0,
        transform: `${style.transform ?? ""} ${mounted ? "" : "scale(0.97)"}`.trim(),
        transition:
          "opacity 0.15s cubic-bezier(0.16,1,0.3,1), transform 0.15s cubic-bezier(0.16,1,0.3,1)",
        willChange: "opacity, transform",
      }}
      role="tooltip"
    >
      <div
        className="font-label"
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: "var(--accent-bright)",
          marginBottom: 4,
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.55,
          color: "var(--text-secondary)",
        }}
      >
        {explanation}
      </div>
    </div>
  );

  // Portal into document.body so we are never clipped.
  if (typeof window === "undefined") return null;

  return ReactDOM.createPortal(content, document.body);
}

export default ScienceTooltip;
