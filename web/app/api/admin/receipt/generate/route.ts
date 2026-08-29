import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

// Schema notes:
// - deposits has no created_at — the timestamp column is uploaded_at.
// - There is no payouts table — monthly payouts are rows in `profits`
//   (id, user_id, month, year, amount, status, payout_date).
// - deposits/profits each have more than one FK to profiles (e.g. deposits:
//   user_id + approved_by), so a profiles(...) embed is ambiguous. The
//   profile is fetched explicitly below using the record's trusted user_id.

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

  const supabase = await createServiceRoleClient();

  // 1. Fetch the deposit or payout record WITHOUT any profiles embed.
  const table = type === "deposit" ? "deposits" : "profits";
  const { data: record, error: fetchErr } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // 2. Fetch the profile explicitly using the record's trusted user_id.
  const userId = (record as { user_id: string }).user_id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, mobile_number, username, city")
    .eq("id", userId)
    .single();

  const rec = record as Record<string, unknown>;
  const prof = profile ?? null;

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
