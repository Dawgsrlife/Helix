"use client";

import { useState, useCallback } from "react";
import { normalizeSequence, isValidSequence } from "@/lib/sequenceUtils";

interface SequenceInputProps {
  onSubmit: (sequence: string) => void;
  isLoading: boolean;
  error: string | null;
}

const EXAMPLES: { name: string; seq: string }[] = [
  {
    name: "BRCA1_Human",
    seq: "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA",
  },
  {
    name: "E_coli_lacZ",
    seq: "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCCAACGCGTTGGGAGCTCTCCCATATGGTCGACCTGCAGGCGGCCGCACTAGTGATTACCCTGTTATCCCTACAGCTCTTCTAGGTGCCCAGAGCTTCACCATACATCTCAATCTAAGTCAAATGGACCCTCACTCAACCCCTATCTCCCCCCTAATGCCTTAACTCAAATCTGGACTATTGGCCATTGCATTGCTGATTTGTGATAGCTTTTTTCCCAGGATGCCAGTCTTCTGAAGCAAACTTTTTCAAAATGTCCACTGCACAGGCCAGATGGTAAGTGAAGAAATCAACTCCAGCAGCAGCTACTATGGGATCCGGTTCTTGTCAAGTTCACAGATTTTAGATGCCAGTCGCCCACCAGCCAACCTTTAGCTACAATGGCATTGACAACTCACAACGTGGC",
  },
  {
    name: "T4_Phage",
    seq: "ATGGCTAACGTAATTAAAACCGACAAACCATCTATCGTATTCTTAGACAATGGTTCTTGTCAGTACAAATATGGTATCAAAGAGTATAACAAAGCGGTTTCTGATGCAACTTTAATTTCACCACATGTTAAAGAGTTGAGCAAAGAAACTTTCAAGGCTATCGTTAACGGTCAAGAATACAAATACAAAGATAGTGAAGCTATCATCGATGCTGTTAAGTTAGACGGAAGCATCCGTATTAAATTAAGTTCTGTTAACTTCGATACAGCGAACTATAAATACGATATC",
  },
];

export default function SequenceInput({
  onSubmit,
  isLoading,
  error,
}: SequenceInputProps) {
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const normalized = normalizeSequence(input);
  const charCount = normalized.length;
  const kbSize = (charCount / 1000).toFixed(2);

  const handleSubmit = useCallback(() => {
    if (charCount === 0) {
      setValidationError("Please enter a DNA sequence");
      return;
    }
    if (!isValidSequence(normalized)) {
      setValidationError("Sequence contains invalid characters. Use only A, T, C, G, N.");
      return;
    }
    if (charCount < 10) {
      setValidationError("Sequence must be at least 10 nucleotides");
      return;
    }
    setValidationError(null);
    onSubmit(normalized);
  }, [charCount, normalized, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
    },
    [handleSubmit]
  );

  const loadExample = (seq: string) => {
    setInput(seq);
    setValidationError(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full" style={{ background: "#93edd9" }} />
          <span
            className="uppercase tracking-[0.3em]"
            style={{
              fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
              fontSize: "10px",
              color: "#93edd9",
            }}
          >
            New Analysis
          </span>
        </div>
        <h1
          className="italic text-4xl md:text-5xl mb-4"
          style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif", color: "#fffbfe" }}
        >
          Paste a sequence
        </h1>
        <p className="text-sm leading-relaxed max-w-lg" style={{ color: "#adaaad" }}>
          Input genomic data or protein strings for high-fidelity structural
          synthesis and alignment.
        </p>
      </div>

      {/* Textarea */}
      <div className="mb-4">
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setValidationError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={">ID_HELI_X24\nATGCGACTAGCTAGCTAGCTAG..."}
          spellCheck={false}
          className="w-full h-48 p-5 text-sm resize-none outline-none transition-colors font-mono"
          style={{
            fontFamily: "var(--font-mono), monospace",
            background: "#000000",
            color: "#fffbfe",
            border: "0.5px solid rgba(255,255,255,0.1)",
          }}
        />
        <div className="flex justify-end gap-4 mt-2">
          <span
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#48474a" }}
          >
            {charCount} characters
          </span>
          <span
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#48474a" }}
          >
            {kbSize}kB
          </span>
        </div>
      </div>

      {/* Error */}
      {(validationError ?? error) && (
        <p className="text-sm mb-4" style={{ color: "#ff716c" }}>
          {validationError ?? error}
        </p>
      )}

      {/* Examples + Submit */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <span
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#48474a" }}
          >
            Examples:
          </span>
          {EXAMPLES.map(({ name, seq }) => (
            <button
              key={name}
              onClick={() => loadExample(seq)}
              className="transition-colors hover:text-[#93edd9]"
              style={{
                fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
                fontSize: "12px",
                color: "#93edd9",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          onClick={handleSubmit}
          disabled={isLoading || charCount === 0}
          className="px-8 py-3 uppercase tracking-[0.2em] text-xs transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
          style={{
            fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
            background: "#fffbfe",
            color: "#0e0e10",
          }}
        >
          {isLoading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {/* Status indicator */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <div
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: "#93edd9", animation: "pulse-soft 2s ease-in-out infinite" }}
          />
          <span
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#48474a" }}
          >
            Helix Node: Active
          </span>
        </div>
      </div>
    </div>
  );
}
