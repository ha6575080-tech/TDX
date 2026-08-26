import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Schema notes:
// - deposits has no created_at — the timestamp column is uploaded_at.
// - There is no payouts table — monthly payouts are rows in `profits`
//   (id, user_id, month, year, amount, status, payout_date).

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { type, id, language } = body as {
    type: "deposit" | "payout";
    id: string;
    language: "en" | "ur";
  };

  if (!type || !id) {
    return NextResponse.json({ error: "type and id required" }, { status: 400 });
  }

  // Fetch deposit or payout
  const table = type === "deposit" ? "deposits" : "profits";
  const { data: record, error: fetchErr } = await supabaseAdmin
    .from(table)
    .select("*, profiles!inner(full_name, mobile_number, username, city)")
    .eq("id", id)
    .single();

  if (fetchErr || !record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const rec = record as Record<string, unknown> & {
    profiles: {
      full_name: string; mobile_number: string;
      username: string; city: string | null;
    } | null;
  };
  const prof = rec.profiles;

  return NextResponse.json({
    ok: true,
    receipt: {
      type,
      id: rec.id,
      user: prof?.full_name || "Unknown",
      mobile: prof?.mobile_number || "",
      username: prof?.username || "",
      city: prof?.city || "",
      amount: rec.amount,
      status: rec.status,
      date: type === "deposit"
        ? (rec.uploaded_at as string | null)
        : (rec.payout_date as string | null),
      percentage: (rec.percentage_applied as number | null) ?? null,
      month: (rec.month as number | null) ?? null,
      year: (rec.year as number | null) ?? null,
      language: language === "ur" ? "ur" : "en",
    },
  });
}
