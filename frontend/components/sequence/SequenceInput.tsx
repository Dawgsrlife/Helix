"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { normalizeSequence, isValidSequence } from "@/lib/sequenceUtils";

interface SequenceInputProps {
  onSubmit: (sequence: string) => void;
  isLoading: boolean;
  error: string | null;
}

const EXAMPLE_SEQUENCES = {
  "E. coli lacZ (500bp)":
    "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCCAACGCGTTGGGAGCTCTCCCATATGGTCGACCTGCAGGCGGCCGCACTAGTGATTACCCTGTTATCCCTACAGCTCTTCTAGGTGCCCAGAGCTTCACCATACATCTCAATCTAAGTCAAATGGACCCTCACTCAACCCCTATCTCCCCCCTAATGCCTTAACTCAAATCTGGACTATTGGCCATTGCATTGCTGATTTGTGATAGCTTTTTTCCCAGGATGCCAGTCTTCTGAAGCAAACTTTTTCAAAATGTCCACTGCACAGGCCAGATGGTAAGTGAAGAAATCAACTCCAGCAGCAGCTACTATGGGATCCGGTTCTTGTCAAGTTCACAGATTTTAGATGCCAGTCGCCCACCAGCCAACCTTTAGCTACAATGGCATTGACAACTCACAACGTGGC",
  "Human BRCA1 (200bp)":
    "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGA",
  "Bacteriophage T4 (300bp)":
    "ATGGCTAACGTAATTAAAACCGACAAACCATCTATCGTATTCTTAGACAATGGTTCTTGTCAGTACAAATATGGTATCAAAGAGTATAACAAAGCGGTTTCTGATGCAACTTTAATTTCACCACATGTTAAAGAGTTGAGCAAAGAAACTTTCAAGGCTATCGTTAACGGTCAAGAATACAAATACAAAGATAGTGAAGCTATCATCGATGCTGTTAAGTTAGACGGAAGCATCCGTATTAAATTAAGTTCTGTTAACTTCGATACAGCGAACTATAAATACGATATC",
};

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
      setValidationError("Please enter a DNA sequence");
      return;
    }
    if (!isValidSequence(normalized)) {
      setValidationError("Sequence contains invalid characters. Use only A, T, C, G, N.");
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

  return (
    <motion.div
      className="w-full max-w-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        Paste your sequence
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Enter a DNA sequence (ATCG) to analyze with Evo 2. The model will annotate
        functional regions, compute per-position likelihood scores, and predict protein
        structures.
      </p>

      <textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setValidationError(null);
        }}
        placeholder="ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT..."
        className="w-full h-40 p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-sm resize-none focus:outline-none focus:border-[var(--accent-cyan)] transition-colors placeholder:text-[var(--text-muted)]"
        spellCheck={false}
      />

      {/* Validation / API errors */}
      {(validationError ?? error) && (
        <p className="mt-2 text-sm text-[var(--accent-rose)]">
          {validationError ?? error}
        </p>
      )}

      {/* Stats */}
      {input.length > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)] font-mono">
          {normalizeSequence(input).length} bp
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isLoading || input.length === 0}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-blue)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Analyzing..." : "Analyze Sequence"}
        </button>
      </div>

      {/* Example sequences */}
      <div className="mt-8">
        <p className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">
          Example sequences
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(EXAMPLE_SEQUENCES).map(([name, seq]) => (
            <button
              key={name}
              onClick={() => loadExample(seq)}
              className="px-3 py-1.5 text-xs rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] hover:text-[var(--text-primary)] transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
