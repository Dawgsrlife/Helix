"use client";

import { useState, useCallback, useRef } from "react";
import { normalizeSequence, isValidSequence, gcContent } from "@/lib/sequenceUtils";
import { ArrowRight, Upload, Dna, FileText, Sparkles, Cpu, CheckCircle, Wand2 } from "lucide-react";

interface SequenceInputProps {
  onSubmit: (sequence: string) => void;
  onDesign?: (goal: string) => void;
  isLoading: boolean;
  error: string | null;
}

type InputMode = "paste" | "design";

const EXAMPLES = [
  { name: "BRCA1 (Human)", desc: "Breast cancer gene, 200bp coding region", len: "200 bp",
    seq: "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA" },
  { name: "E. coli lacZ", desc: "Beta-galactosidase, 500bp", len: "500 bp",
    seq: "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCCAACGCGTTGGGAGCTCTCCCATATGGTCGACCTGCAGGCGGCCGCACTAGTGATTACCCTGTTATCCCTACAGCTCTTCTAGGTGCCCAGAGCTTCACCATACATCTCAATCTAAGTCAAATGGACCCTCACTCAACCCCTATCTCCCCCCTAATGCCTTAACTCAAATCTGGACTATTGGCCATTGCATTGCTGATTTGTGATAGCTTTTTTCCCAGGATGCCAGTCTTCTGAAGCAAACTTTTTCAAAATGTCCACTGCACAGGCCAGATGGTAAGTGAAGAAATCAACTCCAGCAGCAGCTACTATGGGATCCGGTTCTTGTCAAGTTCACAGATTTTAGATGCCAGTCGCCCACCAGCCAACCTTTAGCTACAATGGCATTGACAACTCACAACGTGGC" },
  { name: "T4 Phage", desc: "Bacteriophage structural gene, 288bp", len: "288 bp",
    seq: "ATGGCTAACGTAATTAAAACCGACAAACCATCTATCGTATTCTTAGACAATGGTTCTTGTCAGTACAAATATGGTATCAAAGAGTATAACAAAGCGGTTTCTGATGCAACTTTAATTTCACCACATGTTAAAGAGTTGAGCAAAGAAACTTTCAAGGCTATCGTTAACGGTCAAGAATACAAATACAAAGATAGTGAAGCTATCATCGATGCTGTTAAGTTAGACGGAAGCATCCGTATTAAATTAAGTTCTGTTAACTTCGATACAGCGAACTATAAATACGATATC" },
];

const PASTE_STEPS = [
  { step: "1", label: "Region annotation", desc: "Exons, introns, ORFs, regulatory elements" },
  { step: "2", label: "Likelihood scoring", desc: "Per-position Evo 2 log-likelihood scores" },
  { step: "3", label: "Mutation analysis", desc: "Click any base to predict variant effects" },
  { step: "4", label: "Structure prediction", desc: "AlphaFold 3 protein folding for top regions" },
];

const DESIGN_STEPS = [
  { step: "1", label: "Intent parsing", desc: "Extract design parameters from your goal" },
  { step: "2", label: "Context retrieval", desc: "Search NCBI, PubMed, ClinVar in parallel" },
  { step: "3", label: "Candidate generation", desc: "Evo 2 generates sequences token by token" },
  { step: "4", label: "4D scoring", desc: "Functional, tissue, off-target, novelty" },
  { step: "5", label: "Structure prediction", desc: "Fold top candidates with ESMFold" },
  { step: "6", label: "Explanation", desc: "Mechanistic rationale for each candidate" },
];

const DESIGN_EXAMPLES = [
  { name: "BDNF Enhancer", desc: "Neural growth factor enhancer for hippocampal neurons",
    goal: "Design a BDNF enhancer sequence optimized for high expression in hippocampal neurons with minimal off-target activity" },
  { name: "Insulin Promoter", desc: "Pancreatic beta-cell specific promoter",
    goal: "Design a synthetic insulin promoter for targeted expression in pancreatic beta cells" },
  { name: "Phage Therapy", desc: "Lytic gene for antibiotic-resistant bacteria",
    goal: "Design a lytic cassette targeting antibiotic-resistant Staphylococcus aureus with high specificity" },
];

export default function SequenceInput({ onSubmit, onDesign, isLoading, error }: SequenceInputProps) {
  const [mode, setMode] = useState<InputMode>(onDesign ? "design" : "paste");
  const [input, setInput] = useState("");
  const [designGoal, setDesignGoal] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalized = normalizeSequence(input);
  const charCount = normalized.length;
  const gc = charCount > 0 ? gcContent(normalized) : 0;

  const handlePasteSubmit = useCallback(() => {
    if (charCount === 0) { setValidationError("Please enter a DNA sequence"); return; }
    if (!isValidSequence(normalized)) { setValidationError("Invalid characters. Use only A, T, C, G, N."); return; }
    if (charCount < 10) { setValidationError("Sequence must be at least 10 nucleotides"); return; }
    setValidationError(null);
    onSubmit(normalized);
  }, [charCount, normalized, onSubmit]);

  const handleDesignSubmit = useCallback(() => {
    if (!designGoal.trim()) { setValidationError("Describe what you want to design"); return; }
    if (designGoal.trim().length < 10) { setValidationError("Please provide a more detailed description"); return; }
    setValidationError(null);
    onDesign?.(designGoal.trim());
  }, [designGoal, onDesign]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      mode === "paste" ? handlePasteSubmit() : handleDesignSubmit();
    }
  }, [mode, handlePasteSubmit, handleDesignSubmit]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const cleaned = text.split("\n").filter(l => !l.startsWith(">")).join("");
      setInput(cleaned);
      setValidationError(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── PRIMARY: Intake area ── */}
      <div className="flex-1 overflow-auto px-10 py-10">
        <div className="max-w-2xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Dna size={18} style={{ color: "var(--accent)" }} />
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                {mode === "paste" ? "Analyze Sequence" : "Design Pipeline"}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
              {mode === "paste" ? "Paste a sequence" : "Describe your design"}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {mode === "paste"
                ? "Enter a DNA sequence to analyze with Evo 2. The model will annotate functional regions, compute per-position likelihood scores, and predict protein structures."
                : "Describe the genomic element you want to design. Evo 2 will generate, score, and fold candidates in real time."}
            </p>
          </div>

          {/* Mode toggle */}
          {onDesign && (
            <div className="flex rounded-lg overflow-hidden mb-6" style={{ background: "var(--surface-raised)" }}>
              <button onClick={() => { setMode("paste"); setValidationError(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-colors"
                style={{
                  background: mode === "paste" ? "color-mix(in oklch, var(--accent), transparent 90%)" : "transparent",
                  color: mode === "paste" ? "var(--accent)" : "var(--text-muted)",
                }}>
                <Dna size={14} /> Paste Sequence
              </button>
              <button onClick={() => { setMode("design"); setValidationError(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-colors"
                style={{
                  background: mode === "design" ? "color-mix(in oklch, var(--accent), transparent 90%)" : "transparent",
                  color: mode === "design" ? "var(--accent)" : "var(--text-muted)",
                  borderLeft: "1px solid var(--ghost-border)",
                }}>
                <Wand2 size={14} /> Design New
              </button>
            </div>
          )}

          {mode === "paste" ? (
            <>
              {/* Input surface */}
              <div className="rounded-xl overflow-hidden mb-4" style={{ background: "var(--surface-raised)" }}>
                <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--ghost-border)" }}>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sequence Editor</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors hover:bg-white/[0.04]"
                      style={{ color: "var(--text-muted)" }}>
                      <Upload size={12} /> Upload FASTA
                    </button>
                    <input ref={fileRef} type="file" accept=".fasta,.fa,.txt" onChange={handleFile} className="hidden" />
                  </div>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setValidationError(null); }}
                  onKeyDown={handleKeyDown}
                  placeholder=">sequence_id&#10;ATGGATTTATCTGCTCTTCGCGTT..."
                  spellCheck={false}
                  className="w-full h-48 px-4 py-3 text-[13px] resize-none outline-none font-mono"
                  style={{ background: "transparent", color: "var(--text-primary)", lineHeight: "1.7" }}
                />
                <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid var(--ghost-border)" }}>
                  <div className="flex items-center gap-4">
                    {charCount > 0 && (
                      <>
                        <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>{charCount} bp</span>
                        <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>GC: {(gc * 100).toFixed(1)}%</span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Cmd+Enter to analyze</span>
                </div>
              </div>

              {(validationError ?? error) && (
                <p className="text-[13px] mb-4" style={{ color: "var(--base-t)" }}>{validationError ?? error}</p>
              )}

              <button onClick={handlePasteSubmit} disabled={isLoading || charCount === 0}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01]"
                style={{ background: charCount > 0 ? "var(--accent)" : "var(--surface-elevated)", color: charCount > 0 ? "var(--surface-base)" : "var(--text-faint)" }}>
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Analyzing...</>
                ) : (
                  <><Sparkles size={16} /> Run Analysis</>
                )}
              </button>

              {/* Example sequences */}
              <div className="mt-8">
                <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Example sequences</span>
                <div className="space-y-2">
                  {EXAMPLES.map(({ name, desc, len, seq }) => (
                    <button key={name} onClick={() => { setInput(seq); setValidationError(null); }}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors hover:bg-white/[0.04]"
                      style={{ border: "1px solid var(--ghost-border)" }}>
                      <FileText size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium block" style={{ color: "var(--text-primary)" }}>{name}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{desc}</span>
                      </div>
                      <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--text-faint)" }}>{len}</span>
                      <ArrowRight size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Design goal input */}
              <div className="rounded-xl overflow-hidden mb-4" style={{ background: "var(--surface-raised)" }}>
                <div className="flex items-center px-4 py-2" style={{ borderBottom: "1px solid var(--ghost-border)" }}>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Design Goal</span>
                </div>
                <textarea
                  value={designGoal}
                  onChange={(e) => { setDesignGoal(e.target.value); setValidationError(null); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Design a BDNF enhancer sequence optimized for hippocampal neurons..."
                  spellCheck={false}
                  className="w-full h-32 px-4 py-3 text-[13px] resize-none outline-none"
                  style={{ background: "transparent", color: "var(--text-primary)", lineHeight: "1.7" }}
                />
                <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid var(--ghost-border)" }}>
                  <span className="text-[11px] font-mono" style={{ color: "var(--text-faint)" }}>
                    {designGoal.trim().length > 0 ? `${designGoal.trim().length} chars` : ""}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Cmd+Enter to design</span>
                </div>
              </div>

              {(validationError ?? error) && (
                <p className="text-[13px] mb-4" style={{ color: "var(--base-t)" }}>{validationError ?? error}</p>
              )}

              <button onClick={handleDesignSubmit} disabled={isLoading || !designGoal.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01]"
                style={{ background: designGoal.trim() ? "var(--accent)" : "var(--surface-elevated)", color: designGoal.trim() ? "var(--surface-base)" : "var(--text-faint)" }}>
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Designing...</>
                ) : (
                  <><Wand2 size={16} /> Start Design Pipeline</>
                )}
              </button>

              {/* Design examples */}
              <div className="mt-8">
                <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Example goals</span>
                <div className="space-y-2">
                  {DESIGN_EXAMPLES.map(({ name, desc, goal }) => (
                    <button key={name} onClick={() => { setDesignGoal(goal); setValidationError(null); }}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors hover:bg-white/[0.04]"
                      style={{ border: "1px solid var(--ghost-border)" }}>
                      <Wand2 size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium block" style={{ color: "var(--text-primary)" }}>{name}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{desc}</span>
                      </div>
                      <ArrowRight size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── SECONDARY: Context panel ── */}
      <div className="w-[300px] shrink-0 overflow-y-auto px-6 py-10"
        style={{ background: "var(--surface-raised)" }}>

        {/* What happens next */}
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--accent)" }}>
            {mode === "paste" ? "What happens next" : "Pipeline stages"}
          </span>
          <div className="space-y-3">
            {(mode === "paste" ? PASTE_STEPS : DESIGN_STEPS).map(({ step, label, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="text-[11px] font-mono font-semibold shrink-0 w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: "color-mix(in oklch, var(--accent), transparent 90%)", color: "var(--accent)" }}>{step}</span>
                <div>
                  <span className="text-[13px] font-medium block" style={{ color: "var(--text-primary)" }}>{label}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {mode === "paste" && (
          <>
            {/* Accepted formats */}
            <div className="mb-8">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Accepted formats</span>
              <div className="space-y-2">
                {["Raw ATCGN sequence", "FASTA format (headers auto-stripped)", "Single or multi-line input"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <CheckCircle size={12} style={{ color: "var(--accent)" }} />
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Model status */}
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Model status</span>
          <div className="p-4 rounded-lg" style={{ background: "var(--surface-elevated)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Evo 2 (40B)</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-[11px]" style={{ color: "var(--accent)" }}>Ready</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>AlphaFold 3</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-[11px]" style={{ color: "var(--accent)" }}>Ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hardware */}
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Infrastructure</span>
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={14} style={{ color: "var(--text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>ASUS Ascent GX10</span>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>128 GB LPDDRX / Local inference / No rate limits</span>
        </div>
      </div>
    </div>
  );
}
