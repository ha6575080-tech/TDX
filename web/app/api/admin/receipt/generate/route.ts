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
  // Strongest relationship first: exact per-deposit payout(s) for same user/month/year,
  // but with ambiguity protection — multiple deposits must NOT cause arbitrary selection.
  // Order: 1) exact payout(s) (deterministic), 2) exact withdrawal cycle, 3) exact deposit cycle.
  let resolvedPercentage: number | null = null;
  if (type === "payout") {
    const profitUserId = rec.user_id as string | null;
    const profitMonth = rec.month as number | null;
    const profitYear = rec.year as number | null;
    const profitAmount = rec.amount as number | null;
    const profitPayoutDate = rec.payout_date as string | null;

    // 1) Authoritative per-deposit payouts — deterministic handling
    if (profitUserId && profitMonth != null && profitYear != null) {
      const { data: payoutRows } = await supabase
        .from("payouts")
        .select("id, percentage_applied, amount, deposit_id, created_at")
        .eq("user_id", profitUserId)
        .eq("month", profitMonth)
        .eq("year", profitYear)
        .eq("status", "paid")
        .order("created_at", { ascending: true })
        .limit(20);
      const rows = (payoutRows ?? []) as Array<{
        id: string;
        percentage_applied: number | null;
        amount: number | null;
        deposit_id: string | null;
        created_at: string | null;
      }>;
      const validRows = rows.filter((r) => r.percentage_applied != null && [7, 8, 9, 10].includes(Number(r.percentage_applied)));
      if (validRows.length === 1) {
        // Exactly one payout for this user/month/year — deterministic
        resolvedPercentage = validRows[0].percentage_applied!;
      } else if (validRows.length > 1) {
        // Check if all share same percentage — then not ambiguous for display
        const uniqPct = [...new Set(validRows.map((r) => Number(r.percentage_applied)))];
        if (uniqPct.length === 1) {
          resolvedPercentage = uniqPct[0];
        } else {
          // Multiple differing percentages — try exact amount + user + month/year match (demonstrably safe)
          // A profit amount that exactly equals a single payout amount strongly identifies that payout.
          if (profitAmount != null) {
            const exactAmountMatches = validRows.filter((r) => Number(r.amount) === Number(profitAmount));
            if (exactAmountMatches.length === 1) {
              resolvedPercentage = exactAmountMatches[0].percentage_applied!;
            } else if (exactAmountMatches.length > 1) {
              // Multiple payouts with same amount but different percentages — still ambiguous, check if they agree
              const uniqExactPct = [...new Set(exactAmountMatches.map((r) => Number(r.percentage_applied)))];
              if (uniqExactPct.length === 1) resolvedPercentage = uniqExactPct[0];
              // else remain ambiguous → fall through to next fallback (do NOT pick random)
            }
          }
          // If still unresolved, try exact transaction proximity: payout created_at within 48h of profit payout_date
          if (resolvedPercentage == null && profitPayoutDate) {
            const profitTime = new Date(profitPayoutDate).getTime();
            const closeRows = validRows.filter((r) => {
              if (!r.created_at) return false;
              const diff = Math.abs(new Date(r.created_at).getTime() - profitTime);
              return diff <= 48 * 60 * 60 * 1000;
            });
            const uniqClosePct = [...new Set(closeRows.map((r) => Number(r.percentage_applied)))];
            if (closeRows.length === 1) {
              resolvedPercentage = closeRows[0].percentage_applied!;
            } else if (closeRows.length > 1 && uniqClosePct.length === 1) {
              resolvedPercentage = uniqClosePct[0];
            }
          }
          // If still ambiguous, do NOT randomly choose — fall through to withdrawal cycle
        }
      }
    }

    // 2) Exact withdrawal cycle that created this profit — only if cycle_end month/year matches exactly
    if (resolvedPercentage == null && profitUserId && profitMonth != null && profitYear != null) {
      const { data: wdRow } = await supabase
        .from("withdrawals")
        .select("monthly_profit_rate, cycle_end")
        .eq("user_id", profitUserId)
        .not("monthly_profit_rate", "is", null)
        .order("cycle_end", { ascending: false })
        .limit(10);
      const wdList = (wdRow ?? []) as Array<{ monthly_profit_rate: number | null; cycle_end: string | null }>;
      // Only consider withdrawals whose cycle_end exactly matches the profit month/year
      const matchingCycle = wdList.find((w) => {
        if (!w.cycle_end || w.monthly_profit_rate == null) return false;
        const d = new Date(w.cycle_end);
        return d.getUTCMonth() + 1 === profitMonth && d.getUTCFullYear() === profitYear && [7, 8, 9, 10].includes(Math.round(Number(w.monthly_profit_rate)));
      });
      if (matchingCycle?.monthly_profit_rate != null) {
        resolvedPercentage = Math.round(Number(matchingCycle.monthly_profit_rate));
      }
      // No fallback to arbitrary withdrawal rate — must correspond to same cycle
    }

    // 3) Exact deposit cycle — only if deposit next_payout_date month/year matches profit month/year and rate corresponds
    if (resolvedPercentage == null && profitUserId && profitMonth != null && profitYear != null) {
      const { data: depRows } = await supabase
        .from("deposits")
        .select("monthly_profit_pct, next_payout_date, approved_at")
        .eq("user_id", profitUserId)
        .eq("status", "approved")
        .not("monthly_profit_pct", "is", null)
        .not("next_payout_date", "is", null)
        .limit(20);
      const deps = (depRows ?? []) as Array<{
        monthly_profit_pct: number | null;
        next_payout_date: string | null;
        approved_at: string | null;
      }>;
      // Filter to deposits whose next_payout_date month/year matches profit month/year and rate is allowed
      const corresponding = deps.filter((d) => {
        if (d.monthly_profit_pct == null || !d.next_payout_date) return false;
        if (![7, 8, 9, 10].includes(Number(d.monthly_profit_pct))) return false;
        const nd = new Date(d.next_payout_date);
        return nd.getUTCMonth() + 1 === profitMonth && nd.getUTCFullYear() === profitYear;
      });
      if (corresponding.length === 1) {
        resolvedPercentage = corresponding[0].monthly_profit_pct!;
      } else if (corresponding.length > 1) {
        const uniqPct = [...new Set(corresponding.map((d) => Number(d.monthly_profit_pct)))];
        if (uniqPct.length === 1) resolvedPercentage = uniqPct[0];
        // else ambiguous differing percentages for same cycle — do not choose
      }
      // No fallback to most recent deposit if not corresponding to this payout
    }

    // Direct field on profits will never exist (we deliberately do not add percentage_applied to profits),
    // but honor it if a future migration adds it, without overwriting resolved authoritative value.
    if (resolvedPercentage == null && (rec.percentage_applied as number | null) != null) {
      const v = Number(rec.percentage_applied);
      if ([7, 8, 9, 10].includes(v)) resolvedPercentage = v;
    }
  } else {
    // Deposit receipts do not require payout percentage, but expose monthly_profit_pct if present for debugging
    const v = (rec.monthly_profit_pct as number | null) ?? null;
    resolvedPercentage = v != null && [7, 8, 9, 10].includes(Number(v)) ? Number(v) : null;
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
