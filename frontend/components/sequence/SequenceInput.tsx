"use client";

import { useState, useCallback, useRef } from "react";
import { normalizeSequence, isValidSequence, gcContent } from "@/lib/sequenceUtils";
import { ArrowRight, Upload, Dna, FileText, Sparkles, Cpu, CheckCircle } from "lucide-react";

interface SequenceInputProps {
  onSubmit: (sequence: string) => void;
  isLoading: boolean;
  error: string | null;
}

const EXAMPLES = [
  { name: "BRCA1 (Human)", desc: "Breast cancer gene, 200bp coding region", len: "200 bp",
    seq: "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA" },
  { name: "E. coli lacZ", desc: "Beta-galactosidase, 500bp", len: "500 bp",
    seq: "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCCAACGCGTTGGGAGCTCTCCCATATGGTCGACCTGCAGGCGGCCGCACTAGTGATTACCCTGTTATCCCTACAGCTCTTCTAGGTGCCCAGAGCTTCACCATACATCTCAATCTAAGTCAAATGGACCCTCACTCAACCCCTATCTCCCCCCTAATGCCTTAACTCAAATCTGGACTATTGGCCATTGCATTGCTGATTTGTGATAGCTTTTTTCCCAGGATGCCAGTCTTCTGAAGCAAACTTTTTCAAAATGTCCACTGCACAGGCCAGATGGTAAGTGAAGAAATCAACTCCAGCAGCAGCTACTATGGGATCCGGTTCTTGTCAAGTTCACAGATTTTAGATGCCAGTCGCCCACCAGCCAACCTTTAGCTACAATGGCATTGACAACTCACAACGTGGC" },
  { name: "T4 Phage", desc: "Bacteriophage structural gene, 288bp", len: "288 bp",
    seq: "ATGGCTAACGTAATTAAAACCGACAAACCATCTATCGTATTCTTAGACAATGGTTCTTGTCAGTACAAATATGGTATCAAAGAGTATAACAAAGCGGTTTCTGATGCAACTTTAATTTCACCACATGTTAAAGAGTTGAGCAAAGAAACTTTCAAGGCTATCGTTAACGGTCAAGAATACAAATACAAAGATAGTGAAGCTATCATCGATGCTGTTAAGTTAGACGGAAGCATCCGTATTAAATTAAGTTCTGTTAACTTCGATACAGCGAACTATAAATACGATATC" },
];

export default function SequenceInput({ onSubmit, isLoading, error }: SequenceInputProps) {
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalized = normalizeSequence(input);
  const charCount = normalized.length;
  const gc = charCount > 0 ? gcContent(normalized) : 0;

  const handleSubmit = useCallback(() => {
    if (charCount === 0) { setValidationError("Please enter a DNA sequence"); return; }
    if (!isValidSequence(normalized)) { setValidationError("Invalid characters. Use only A, T, C, G, N."); return; }
    if (charCount < 10) { setValidationError("Sequence must be at least 10 nucleotides"); return; }
    setValidationError(null);
    onSubmit(normalized);
  }, [charCount, normalized, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
  }, [handleSubmit]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Strip FASTA headers
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
              <Dna size={18} style={{ color: "#5bb5a2" }} />
              <span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "#5bb5a2" }}>New Analysis</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: "#F0EFED" }}>
              Paste a sequence
            </h1>
            <p className="text-[14px] leading-relaxed" style={{ color: "#999" }}>
              Enter a DNA sequence to analyze with Evo 2. The model will annotate functional regions, compute per-position likelihood scores, and predict protein structures.
            </p>
          </div>

          {/* Input surface */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Input toolbar */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#888" }}>Sequence Editor</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors hover:bg-white/[0.04]"
                  style={{ color: "#888" }}>
                  <Upload size={12} /> Upload FASTA
                </button>
                <input ref={fileRef} type="file" accept=".fasta,.fa,.txt" onChange={handleFile} className="hidden" />
              </div>
            </div>
            {/* Textarea */}
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              placeholder=">sequence_id&#10;ATGGATTTATCTGCTCTTCGCGTT..."
              spellCheck={false}
              className="w-full h-44 px-4 py-3 text-[13px] resize-none outline-none font-mono"
              style={{ background: "transparent", color: "#F0EFED", lineHeight: "1.7" }}
            />
            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-4">
                {charCount > 0 && (
                  <>
                    <span className="text-[11px] font-mono" style={{ color: "#D1D0CC" }}>{charCount} bp</span>
                    <span className="text-[11px] font-mono" style={{ color: "#888" }}>GC: {(gc * 100).toFixed(1)}%</span>
                  </>
                )}
              </div>
              <span className="text-[11px]" style={{ color: "#555" }}>Cmd+Enter to analyze</span>
            </div>
          </div>

          {/* Error */}
          {(validationError ?? error) && (
            <p className="text-[13px] mb-4" style={{ color: "#d47a7a" }}>{validationError ?? error}</p>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={isLoading || charCount === 0}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[14px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01]"
            style={{ background: charCount > 0 ? "#5bb5a2" : "#222225", color: charCount > 0 ? "#141416" : "#555" }}>
            {isLoading ? (
              <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles size={16} /> Run Analysis</>
            )}
          </button>

          {/* Examples */}
          <div className="mt-8">
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "#888" }}>Example sequences</span>
            <div className="space-y-2">
              {EXAMPLES.map(({ name, desc, len, seq }) => (
                <button key={name} onClick={() => { setInput(seq); setValidationError(null); }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors hover:bg-white/[0.03]"
                  style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  <FileText size={16} style={{ color: "#555", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block" style={{ color: "#F0EFED" }}>{name}</span>
                    <span className="text-[11px]" style={{ color: "#888" }}>{desc}</span>
                  </div>
                  <span className="text-[11px] font-mono shrink-0" style={{ color: "#555" }}>{len}</span>
                  <ArrowRight size={14} style={{ color: "#555", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECONDARY: Context panel ── */}
      <div className="w-[300px] shrink-0 overflow-y-auto px-6 py-10"
        style={{ background: "#1c1c1f", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>

        {/* What happens next */}
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "#5bb5a2" }}>What happens next</span>
          <div className="space-y-3">
            {[
              { step: "1", label: "Region annotation", desc: "Exons, introns, ORFs, regulatory elements" },
              { step: "2", label: "Likelihood scoring", desc: "Per-position Evo 2 log-likelihood scores" },
              { step: "3", label: "Mutation analysis", desc: "Click any base to predict variant effects" },
              { step: "4", label: "Structure prediction", desc: "AlphaFold 3 protein folding for top regions" },
            ].map(({ step, label, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="text-[11px] font-mono font-semibold shrink-0 w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: "rgba(91,181,162,0.1)", color: "#5bb5a2" }}>{step}</span>
                <div>
                  <span className="text-[13px] font-medium block" style={{ color: "#F0EFED" }}>{label}</span>
                  <span className="text-[11px]" style={{ color: "#888" }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Accepted formats */}
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "#888" }}>Accepted formats</span>
          <div className="space-y-2">
            {["Raw ATCGN sequence", "FASTA format (headers auto-stripped)", "Single or multi-line input"].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle size={12} style={{ color: "#5bb5a2" }} />
                <span className="text-[12px]" style={{ color: "#D1D0CC" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model status */}
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "#888" }}>Model status</span>
          <div className="p-4 rounded-lg" style={{ background: "#222225", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px]" style={{ color: "#D1D0CC" }}>Evo 2 (40B)</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5bb5a2] animate-pulse" />
                <span className="text-[11px]" style={{ color: "#5bb5a2" }}>Ready</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "#D1D0CC" }}>AlphaFold 3</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5bb5a2] animate-pulse" />
                <span className="text-[11px]" style={{ color: "#5bb5a2" }}>Ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hardware */}
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "#888" }}>Infrastructure</span>
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={14} style={{ color: "#888" }} />
            <span className="text-[12px]" style={{ color: "#D1D0CC" }}>ASUS Ascent GX10</span>
          </div>
          <span className="text-[11px]" style={{ color: "#555" }}>128 GB LPDDRX / Local inference / No rate limits</span>
        </div>
      </div>
    </div>
  );
}
