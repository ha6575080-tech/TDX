import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";

/**
 * POST /api/referral
 *
 * Claims a referral for the AUTHENTICATED user.
 * - The referred user is ALWAYS the session user (never client-supplied).
 * - The referrer is resolved server-side from the referral code via the
 *   atomic claim_referral() RPC (unique constraint + conditional bonus).
 * - Self-referral, invalid codes, and duplicate/replayed claims are rejected
 *   inside the RPC; no client-supplied user IDs are trusted anywhere.
 */
export async function POST(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  let body: { ref_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const refCode = typeof body.ref_code === "string" ? body.ref_code.trim() : "";
  if (!refCode) {
    return NextResponse.json(
      { error: "ref_code is required" },
      { status: 400 }
    );
  }

  // User-scoped server client so auth.uid() is available inside the RPC.
  const supabase = await createClient();

  const { data, error: rpcError } = await supabase.rpc("claim_referral", {
    p_ref_code: refCode,
  });

  if (rpcError) {
    return internalError("referral", rpcError);
  }

  const result = data as { ok?: boolean; reason?: string } | null;

  if (!result?.ok) {
    const reason = result?.reason ?? "unknown";
    const status =
      reason === "not_authenticated" ? 401 : 400;
    return NextResponse.json({ success: false, reason }, { status });
  }

  return NextResponse.json({ success: true });
}