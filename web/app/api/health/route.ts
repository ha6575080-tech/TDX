import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** A bounded, anonymous readiness probe; no member records or keys are returned. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const options = { headers: { "Cache-Control": "no-store" } };
  if (!url || !key) return NextResponse.json({ status: "unavailable" }, { ...options, status: 503 });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) } });
    const { error } = await client.from("packages").select("id").limit(1);
    return NextResponse.json({ status: error ? "unavailable" : "ok" }, { ...options, status: error ? 503 : 200 });
  } catch { return NextResponse.json({ status: "unavailable" }, { ...options, status: 503 }); }
}
