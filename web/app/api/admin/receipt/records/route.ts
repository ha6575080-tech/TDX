import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-errors";

/** Receipt pickers depend only on stable ledger columns, not payment-review
 * metadata or ambiguous PostgREST profile relationships. */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const type = new URL(request.url).searchParams.get("type");
  if (type !== "deposit" && type !== "payout") {
    return NextResponse.json({ error: "Invalid receipt type" }, { status: 400 });
  }
  const supabase = await createServiceRoleClient();
  const { data, error: recordsError } = type === "deposit"
    ? await supabase.from("deposits").select("id, user_id, amount, status, uploaded_at").order("uploaded_at", { ascending: false }).limit(200)
    : await supabase.from("withdrawals").select("id, user_id, amount:net_amount, status, processed_at").eq("status", "completed").order("processed_at", { ascending: false }).limit(200);
  if (recordsError) return internalError("admin/receipt/records", recordsError);
  const rows = data ?? [];
  if (rows.length === 0) return NextResponse.json({ records: [] });
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profileError } = await supabase.from("profiles")
    .select("id, full_name, username").in("id", userIds);
  if (profileError) return internalError("admin/receipt/profiles", profileError);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.username]));
  return NextResponse.json({ records: rows.map((row) => ({ ...row, fullName: names.get(row.user_id) ?? "Unknown" })) });
}
