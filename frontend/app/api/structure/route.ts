/**
 * Mock /api/structure endpoint.
 * STUB: Replace by pointing NEXT_PUBLIC_API_URL to the real backend on the GX10.
 */
import { NextResponse } from "next/server";
import { SAMPLE_PDB } from "@/components/structure/ProteinViewer";

export async function POST() {
  await new Promise((r) => setTimeout(r, 600));

  return NextResponse.json({
    pdb_data: SAMPLE_PDB,
  });
}
