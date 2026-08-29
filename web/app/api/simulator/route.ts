import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runSimulation, sanitizeInput } from "@/lib/simulator";

/**
 * POST /api/simulator
 *
 * Server-side calculation for the Personal Financial Simulator.
 * Purely deterministic math on user-entered ASSUMPTIONS — no real balances
 * are read or modified, no AI, no external services. Requires a session
 * (consistent with the rest of the app); the request body carries only
 * hypothetical numbers, which are sanitized before use.
 *
 * Response is informational: "Simulation only. Actual results may differ."
 */
export async function POST(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = sanitizeInput(body);
  const result = runSimulation(input);

  return NextResponse.json({
    ok: true,
    notice: "Simulation only. Actual results may differ.",
    result,
  });
}
