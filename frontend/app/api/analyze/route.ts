/**
 * Mock /api/analyze endpoint.
 * STUB: Replace by pointing NEXT_PUBLIC_API_URL to the real backend on the GX10.
 */
import { NextResponse } from "next/server";
import { SAMPLE_PDB } from "@/components/structure/ProteinViewer";

function generateMockRegions(length: number) {
  const regions = [];
  let pos = 0;
  const types = [
    { type: "exon", min: 40, max: 120 },
    { type: "intron", min: 20, max: 80 },
    { type: "orf", min: 60, max: 200 },
    { type: "intergenic", min: 15, max: 50 },
    { type: "exon", min: 30, max: 90 },
    { type: "trna", min: 20, max: 40 },
  ];
  let idx = 0;
  while (pos < length) {
    const t = types[idx % types.length];
    const rlen = Math.min(t.min + Math.floor(Math.random() * (t.max - t.min)), length - pos);
    regions.push({
      start: pos,
      end: pos + rlen,
      type: t.type,
      label: `${t.type.charAt(0).toUpperCase() + t.type.slice(1)} ${idx + 1}`,
      score: Math.round((-Math.random() * 4 - 0.5) * 100) / 100,
    });
    pos += rlen;
    idx++;
  }
  return regions;
}

function generateMockScores(length: number, regions: ReturnType<typeof generateMockRegions>) {
  const scores = [];
  for (let i = 0; i < length; i++) {
    const region = regions.find((r: { start: number; end: number }) => i >= r.start && i < r.end);
    let base = -2.0 - Math.random() * 1.5;
    if (region?.type === "exon" || region?.type === "orf") {
      const codonPos = (i - region.start) % 3;
      base = -1.5 - Math.random() * 0.8 + (codonPos === 2 ? 0.4 : 0);
    } else if (region?.type === "intron") {
      base = -3.0 - Math.random() * 2;
    }
    base += Math.sin(i * 0.05) * 0.3;
    scores.push({ position: i, score: Math.round(base * 1000) / 1000 });
  }
  return scores;
}

export async function POST(request: Request) {
  const body = await request.json();
  const sequence: string = body.sequence ?? "";

  if (!sequence || sequence.length < 10) {
    return NextResponse.json({ message: "Sequence must be at least 10 nucleotides" }, { status: 400 });
  }

  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 800));

  const regions = generateMockRegions(sequence.length);
  const scores = generateMockScores(sequence.length, regions);

  const largestCoding = regions
    .filter((r) => r.type === "orf" || r.type === "exon")
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

  return NextResponse.json({
    sequence,
    regions,
    scores,
    proteins: largestCoding
      ? [{
          region_start: largestCoding.start,
          region_end: largestCoding.end,
          pdb_data: SAMPLE_PDB,
          sequence_identity: 0.78 + Math.random() * 0.15,
        }]
      : [],
  });
}
