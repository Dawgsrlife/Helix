/**
 * Mock /api/health endpoint.
 * STUB: Replace by pointing NEXT_PUBLIC_API_URL to the real backend on the GX10.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    model: "evo2-7b-mock",
    gpu_available: false,
    inference_mode: "mock",
  });
}
