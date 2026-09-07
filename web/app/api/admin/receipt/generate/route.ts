import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

// Schema notes:
// - deposits.uploaded_at is the creation timestamp (no created_at).
// - Monthly payouts are authoritative in `payouts` (per-deposit, percentage_applied)
//   and `profits` (per-user-month ledger, single accounting history). Withdrawals
//   store `monthly_profit_rate` for the cycle that created the profit.
//   This endpoint resolves payout percentage from the authoritative source
//   rather than duplicating it onto `profits`.
// - deposits/profits each have more than one FK to profiles, so a profiles(...)
//   embed is ambiguous. Profile is fetched explicitly via trusted user_id.

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

  // Resolve payout percentage from authoritative source without duplicating onto profits.
  // Preferred: payouts.percentage_applied (per-deposit, exact).
  // Fallback: withdrawals.monthly_profit_rate (cycle that created the profit).
  // Last fallback: deposits.monthly_profit_pct (most recent approved deposit).
  let resolvedPercentage: number | null = null;
  if (type === "payout") {
    const profitUserId = rec.user_id as string | null;
    const profitMonth = rec.month as number | null;
    const profitYear = rec.year as number | null;

    // 1) Authoritative per-deposit payouts for same user/month/year (most recent)
    if (profitUserId && profitMonth != null && profitYear != null) {
      const { data: payoutRow } = await supabase
        .from("payouts")
        .select("percentage_applied, created_at")
        .eq("user_id", profitUserId)
        .eq("month", profitMonth)
        .eq("year", profitYear)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payoutRow && (payoutRow as { percentage_applied: number | null }).percentage_applied != null) {
        resolvedPercentage = (payoutRow as { percentage_applied: number }).percentage_applied;
      }
    }

    // 2) Withdrawal cycle that created this profit (monthly_profit_rate)
    if (resolvedPercentage == null && profitUserId && profitMonth != null && profitYear != null) {
      const { data: wdRow } = await supabase
        .from("withdrawals")
        .select("monthly_profit_rate, cycle_end, created_at")
        .eq("user_id", profitUserId)
        .not("monthly_profit_rate", "is", null)
        .order("cycle_end", { ascending: false })
        .limit(10);
      const wdList = (wdRow ?? []) as Array<{ monthly_profit_rate: number | null; cycle_end: string | null }>;
      const matching = wdList.find((w) => {
        if (!w.cycle_end) return false;
        const d = new Date(w.cycle_end);
        return d.getUTCMonth() + 1 === profitMonth && d.getUTCFullYear() === profitYear;
      });
      const fallbackWd = matching ?? wdList.find((w) => w.monthly_profit_rate != null);
      if (fallbackWd?.monthly_profit_rate != null) {
        resolvedPercentage = Math.round(Number(fallbackWd.monthly_profit_rate));
      }
    }

    // 3) Most recent approved deposit's monthly_profit_pct for this user
    if (resolvedPercentage == null && profitUserId) {
      const { data: depRow } = await supabase
        .from("deposits")
        .select("monthly_profit_pct, approved_at")
        .eq("user_id", profitUserId)
        .eq("status", "approved")
        .not("monthly_profit_pct", "is", null)
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (depRow && (depRow as { monthly_profit_pct: number | null }).monthly_profit_pct != null) {
        resolvedPercentage = (depRow as { monthly_profit_pct: number }).monthly_profit_pct;
      }
    }

    // Direct field on profits will never exist (we deliberately do not add percentage_applied to profits),
    // but honor it if a future migration adds it, without overwriting resolved authoritative value.
    if (resolvedPercentage == null && (rec.percentage_applied as number | null) != null) {
      resolvedPercentage = rec.percentage_applied as number;
    }
    // Ensure only allowed values 7-10 pass through
    if (resolvedPercentage != null && ![7, 8, 9, 10].includes(Number(resolvedPercentage))) {
      resolvedPercentage = null;
    }
  } else {
    // Deposit receipts do not require percentage, but expose monthly_profit_pct if present for debugging
    resolvedPercentage = (rec.monthly_profit_pct as number | null) ?? null;
    if (resolvedPercentage != null && ![7, 8, 9, 10].includes(Number(resolvedPercentage))) {
      resolvedPercentage = null;
    }
  }

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
      percentage: resolvedPercentage,
      month: (rec.month as number | null) ?? null,
      year: (rec.year as number | null) ?? null,
      language: language === "ur" ? "ur" : "en",
    },
  });
}
