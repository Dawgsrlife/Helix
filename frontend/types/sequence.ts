export type AnnotationType =
  | "exon"
  | "intron"
  | "orf"
  | "prophage"
  | "trna"
  | "rrna"
  | "intergenic"
  | "unknown";

export interface SequenceRegion {
  start: number; // 0-indexed
  end: number;
  type: AnnotationType;
  label?: string;
  score?: number; // Evo 2 likelihood score for this region
}

export type Nucleotide = "A" | "T" | "C" | "G" | "N";

export interface Base {
  position: number;
  nucleotide: Nucleotide;
  likelihoodScore?: number;
  annotationType?: AnnotationType;
}
