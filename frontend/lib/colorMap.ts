import type { AnnotationType, Nucleotide } from "@/types";

export const ANNOTATION_COLORS: Record<AnnotationType, string> = {
  exon: "var(--annotation-exon)",
  intron: "var(--annotation-intron)",
  orf: "var(--annotation-orf)",
  prophage: "var(--annotation-prophage)",
  trna: "var(--annotation-trna)",
  rrna: "var(--annotation-rrna)",
  intergenic: "var(--annotation-intergenic)",
  unknown: "var(--annotation-unknown)",
};

export const BASE_COLORS: Record<Nucleotide, string> = {
  A: "var(--base-a)",
  T: "var(--base-t)",
  C: "var(--base-c)",
  G: "var(--base-g)",
  N: "var(--base-n)",
};

export const ANNOTATION_LABELS: Record<AnnotationType, string> = {
  exon: "Exon",
  intron: "Intron",
  orf: "ORF",
  prophage: "Prophage",
  trna: "tRNA",
  rrna: "rRNA",
  intergenic: "Intergenic",
  unknown: "Unknown",
};

export const IMPACT_COLORS = {
  benign: "#22c55e",
  moderate: "#f59e0b",
  deleterious: "#ef4444",
} as const;
