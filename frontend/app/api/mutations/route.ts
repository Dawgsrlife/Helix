/**
 * Mock /api/mutations endpoint.
 * STUB: Replace by pointing NEXT_PUBLIC_API_URL to the real backend on the GX10.
 */
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const sequence: string = body.sequence ?? "";
  const position: number = body.position ?? 0;
  const alternateBase: string = body.alternate_base ?? "A";

  if (position < 0 || position >= sequence.length) {
    return NextResponse.json({ message: "Position out of range" }, { status: 400 });
  }

  await new Promise((r) => setTimeout(r, 400));

  const referenceBase = sequence[position] ?? "N";
  const delta = -(Math.random() * 8 + 0.5) * (Math.random() > 0.3 ? 1 : -0.1);
  const abs = Math.abs(delta);
  const impact = abs < 1 ? "benign" : abs < 3 ? "moderate" : "deleterious";

  return NextResponse.json({
    position,
    reference_base: referenceBase,
    alternate_base: alternateBase,
    delta_likelihood: Math.round(delta * 100) / 100,
    predicted_impact: impact,
  });
}
