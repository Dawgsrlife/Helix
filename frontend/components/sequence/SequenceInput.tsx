"use client";

import { useState } from "react";
import { normalizeSequence, isValidSequence } from "@/lib/sequenceUtils";

interface SequenceInputProps {
  onSubmit: (sequence: string) => void;
  isLoading: boolean;
  error: string | null;
}

const EXAMPLES: { name: string; seq: string }[] = [
  {
    name: "E. coli lacZ",
    seq: "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCCAACGCGTTGGGAGCTCTCCCATATGGTCGACCTGCAGGCGGCCGCACTAGTGATTACCCTGTTATCCCTACAGCTCTTCTAGGTGCCCAGAGCTTCACCATACATCTCAATCTAAGTCAAATGGACCCTCACTCAACCCCTATCTCCCCCCTAATGCCTTAACTCAAATCTGGACTATTGGCCATTGCATTGCTGATTTGTGATAGCTTTTTTCCCAGGATGCCAGTCTTCTGAAGCAAACTTTTTCAAAATGTCCACTGCACAGGCCAGATGGTAAGTGAAGAAATCAACTCCAGCAGCAGCTACTATGGGATCCGGTTCTTGTCAAGTTCACAGATTTTAGATGCCAGTCGCCCACCAGCCAACCTTTAGCTACAATGGCATTGACAACTCACAACGTGGC",
  },
  {
    name: "BRCA1 region",
    seq: "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA",
  },
  {
    name: "T4 phage",
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

  const handleSubmit = () => {
    const normalized = normalizeSequence(input);
    if (normalized.length === 0) {
      setValidationError("Enter a DNA sequence");
      return;
    }
    if (!isValidSequence(normalized)) {
      setValidationError("Invalid characters. Use only A, T, C, G, N.");
      return;
    }
    if (normalized.length < 10) {
      setValidationError("Sequence must be at least 10 nucleotides");
      return;
    }
    setValidationError(null);
    onSubmit(normalized);
  };

  const loadExample = (seq: string) => {
    setInput(seq);
    setValidationError(null);
  };

  const bpCount = normalizeSequence(input).length;
  const displayError = validationError ?? error;

  return (
    <div
      className="w-full flex flex-col items-center justify-center"
      style={{ maxWidth: "560px" }}
    >
      {/* Label */}
      <span
        className="self-start uppercase tracking-wider"
        style={{
          fontSize: "11px",
          color: "#5bb5a2",
          fontWeight: 600,
          letterSpacing: "0.05em",
          marginBottom: "8px",
        }}
      >
        New analysis
      </span>

      {/* Heading */}
      <h1
        className="self-start"
        style={{
          fontSize: "28px",
          fontWeight: 500,
          color: "#e5e1e4",
          marginBottom: "8px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        Paste a sequence
      </h1>

      {/* Subtext */}
      <p
        className="self-start"
        style={{
          fontSize: "14px",
          color: "#6b6b6b",
          marginBottom: "24px",
          lineHeight: "1.5",
        }}
      >
        ATCG format. The model handles annotation, scoring, and structure prediction.
      </p>

      {/* Textarea */}
      <textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setValidationError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="ATCCGTAC..."
        spellCheck={false}
        className="w-full resize-none outline-none font-mono"
        style={{
          height: "160px",
          padding: "16px",
          backgroundColor: "#161618",
          border: "1px solid #2a2a2c",
          borderRadius: "6px",
          color: "#e5e1e4",
          fontSize: "13px",
          lineHeight: "1.6",
          transition: "border-color 0.15s ease",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#5bb5a2";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#2a2a2c";
        }}
      />

      {/* Meta row: bp count + error */}
      <div className="w-full flex justify-between items-center mt-2" style={{ minHeight: "20px" }}>
        {displayError ? (
          <span style={{ fontSize: "12px", color: "#d47a7a" }}>{displayError}</span>
        ) : (
          <span style={{ fontSize: "11px", color: "#4a4a4a", fontFamily: "var(--font-mono, monospace)" }}>
            {bpCount > 0 ? `${bpCount} bp` : ""}
          </span>
        )}
        <span style={{ fontSize: "11px", color: "#3a3a3c" }}>
          {bpCount > 0 ? `GC ${(gcQuick(input) * 100).toFixed(0)}%` : ""}
        </span>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || input.length === 0}
        className="self-start mt-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          padding: "10px 24px",
          backgroundColor: "#e5e1e4",
          color: "#0c0c0e",
          fontSize: "14px",
          fontWeight: 500,
          borderRadius: "6px",
          border: "none",
          transition: "opacity 0.15s ease",
        }}
        onMouseEnter={(e) => {
          if (!isLoading) (e.currentTarget as HTMLElement).style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
        }}
      >
        {isLoading ? "Analyzing..." : "Analyze"}
      </button>

      {/* Examples */}
      <div className="w-full mt-12">
        <div
          className="flex items-center gap-4"
          style={{ borderTop: "1px solid #1e1e20", paddingTop: "16px" }}
        >
          <span
            className="uppercase tracking-wider shrink-0"
            style={{ fontSize: "10px", color: "#4a4a4a", fontWeight: 600, letterSpacing: "0.05em" }}
          >
            Try examples
          </span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.name}
              onClick={() => loadExample(ex.seq)}
              className="cursor-pointer"
              style={{
                fontSize: "13px",
                color: "#6b6b6b",
                background: "none",
                border: "none",
                padding: 0,
                textDecoration: "none",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#8a8a8a";
                (e.currentTarget as HTMLElement).style.textDecoration = "underline";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#6b6b6b";
                (e.currentTarget as HTMLElement).style.textDecoration = "none";
              }}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function gcQuick(raw: string): number {
  const seq = raw.replace(/[^ATCGatcg]/g, "").toUpperCase();
  if (seq.length === 0) return 0;
  let gc = 0;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] === "G" || seq[i] === "C") gc++;
  }
  return gc / seq.length;
}
