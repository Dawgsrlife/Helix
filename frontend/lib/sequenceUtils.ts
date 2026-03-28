import type { Base, Nucleotide, AnnotationType, SequenceRegion } from "@/types";

const VALID_BASES = new Set(["A", "T", "C", "G", "N"]);

/** Validate that a string contains only ATCGN characters */
export function isValidSequence(seq: string): boolean {
  return seq.split("").every((ch) => VALID_BASES.has(ch.toUpperCase()));
}

/** Clean and normalize raw input to uppercase ATCGN */
export function normalizeSequence(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/[^ATCGNatcgn]/g, "")
    .toUpperCase();
}

/** Parse a raw sequence string into an array of Base objects */
export function parseSequence(
  raw: string,
  regions?: SequenceRegion[]
): Base[] {
  const seq = normalizeSequence(raw);
  return seq.split("").map((ch, i) => ({
    position: i,
    nucleotide: ch as Nucleotide,
    annotationType: regions
      ? getAnnotationAtPosition(i, regions)
      : undefined,
  }));
}

/** Get the annotation type at a given position */
export function getAnnotationAtPosition(
  position: number,
  regions: SequenceRegion[]
): AnnotationType | undefined {
  const region = regions.find((r) => position >= r.start && position < r.end);
  return region?.type;
}

/** Chunk a sequence into lines of given length for display */
export function chunkSequence(seq: string, lineLength: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < seq.length; i += lineLength) {
    chunks.push(seq.slice(i, i + lineLength));
  }
  return chunks;
}

/** Format a position number with commas */
export function formatPosition(pos: number): string {
  return pos.toLocaleString();
}

/** Calculate GC content of a sequence */
export function gcContent(seq: string): number {
  const normalized = normalizeSequence(seq);
  if (normalized.length === 0) return 0;
  const gc = normalized.split("").filter((b) => b === "G" || b === "C").length;
  return gc / normalized.length;
}

/** Get complement of a nucleotide */
export function complement(base: Nucleotide): Nucleotide {
  const map: Record<Nucleotide, Nucleotide> = {
    A: "T",
    T: "A",
    C: "G",
    G: "C",
    N: "N",
  };
  return map[base];
}

/** Get reverse complement of a sequence */
export function reverseComplement(seq: string): string {
  return seq
    .split("")
    .reverse()
    .map((b) => complement(b.toUpperCase() as Nucleotide))
    .join("");
}
