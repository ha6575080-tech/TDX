import { readJsonObject, isUuid } from "@/lib/request-validation";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";
import { pakistanDate } from "@/lib/dates";

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  let body: { type?: unknown; id?: unknown; language?: unknown };
  try { body = await readJsonObject(request); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!isUuid(body.id) || (body.type !== "deposit" && body.type !== "payout")) return NextResponse.json({ error: "A valid receipt type and ID are required" }, { status: 400 });
  const client = await createServiceRoleClient();
  let record: Record<string, unknown> | null;
  let monthlySummary = false;
  const primary = await client.from(body.type === "deposit" ? "deposits" : "withdrawals").select("*").eq("id", body.id).maybeSingle();
  if (primary.error) return internalError("admin/receipt", primary.error);
  record = primary.data;
  if (!record && body.type === "payout") {
    const legacy = await client.from("profits").select("*").eq("id", body.id).maybeSingle();
    if (legacy.error) return internalError("admin/receipt", legacy.error);
    record = legacy.data;
    monthlySummary = true;
  }
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (body.type === "payout" && !monthlySummary && record.status !== "completed") return NextResponse.json({ error: "A payout receipt is available after payment is completed." }, { status: 409 });
  if (typeof record.user_id !== "string") return internalError("admin/receipt", new Error("Missing receipt owner"));
  const { data: profile, error: profileError } = await client.from("profiles").select("full_name, mobile_number, username, city").eq("id", record.user_id).single();
  if (profileError || !profile) return internalError("admin/receipt/profile", profileError ?? new Error("Missing receipt profile"));
  const number = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const rate = number(body.type === "deposit" ? record.monthly_profit_pct : monthlySummary ? null : record.monthly_profit_rate);
  let month = number(record.month), year = number(record.year);
  const cycleEnd = record.cycle_end;
  if (!monthlySummary && typeof cycleEnd === "string" && Number.isFinite(new Date(cycleEnd).getTime())) {
    const parts = pakistanDate(new Date(cycleEnd)).split("-"); year = Number(parts[0]); month = Number(parts[1]);
  }
  return NextResponse.json({ ok: true, receipt: {
    type: body.type, id: record.id, user: profile.full_name || profile.username || "—", mobile: profile.mobile_number || "", username: profile.username || "", city: profile.city || "",
    amount: number(body.type === "payout" && !monthlySummary ? record.net_amount : record.amount),
    grossAmount: body.type === "payout" && !monthlySummary ? number(record.amount) : null,
    fee: body.type === "payout" && !monthlySummary ? number(record.fee) : null,
    status: record.status, date: body.type === "deposit" ? record.uploaded_at : monthlySummary ? record.payout_date : record.processed_at,
    percentage: rate != null && [7,8,9,10].includes(rate) ? rate : null,
    month, year, recordKind: monthlySummary ? "monthly_summary" : "transaction", language: body.language === "ur" ? "ur" : "en",
  } });
}
