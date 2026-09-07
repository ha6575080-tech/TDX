import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabaseUrl is required.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "monthly";

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "daily":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarterly":
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      break;
    case "6months":
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      break;
    case "yearly":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Deposits: approved deposits within period (use approved_at when present, else uploaded_at)
  const { data: deposits } = await getSupabaseAdmin()
    .from("deposits")
    .select("amount, approved_at, uploaded_at")
    .eq("status", "approved")
    .gte("approved_at", startDate.toISOString());

  const { data: payouts } = await getSupabaseAdmin()
    .from("payouts")
    .select("amount, created_at, user_id, month, year")
    .eq("status", "paid")
    .gte("created_at", startDate.toISOString());

  // Profits ledger: per-user monthly profit (paid) — separate from per-deposit payouts.
  // Used to detect omission of legacy profit payouts and to avoid double-counting.
  const { data: profitsPaid } = await getSupabaseAdmin()
    .from("profits")
    .select("amount, payout_date, user_id, month, year")
    .eq("status", "paid")
    .gte("payout_date", startDate.toISOString());

  const { data: withdrawals } = await getSupabaseAdmin()
    .from("withdrawals")
    .select("amount, requested_at")
    .in("status", ["approved", "completed"])
    .gte("requested_at", startDate.toISOString());

  const { count: totalUsers } = await getSupabaseAdmin()
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const { count: activeUsers } = await getSupabaseAdmin()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const totalDeposits = (deposits || []).reduce(
    (s: number, d: Record<string, unknown>) => s + Number(d.amount ?? 0),
    0
  );
  const totalPayoutsPerDeposit = (payouts || []).reduce(
    (s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0),
    0
  );
  // Dedup: profits for user/month already covered by at least one per-deposit payout for same month should not double-count.
  const payoutKeys = new Set(
    (payouts || []).map(
      (p: Record<string, unknown>) => `${p.user_id}-${p.month}-${p.year}`
    )
  );
  const nonOverlappingProfits = (profitsPaid || []).filter(
    (pr: Record<string, unknown>) => !payoutKeys.has(`${pr.user_id}-${pr.month}-${pr.year}`)
  );
  const totalProfitsPaid = (profitsPaid || []).reduce(
    (s: number, pr: Record<string, unknown>) => s + Number(pr.amount ?? 0),
    0
  );
  const totalProfitsNonOverlapping = nonOverlappingProfits.reduce(
    (s: number, pr: Record<string, unknown>) => s + Number(pr.amount ?? 0),
    0
  );
  // Authoritative total payouts for PnL: per-deposit payouts + legacy profits that have no per-deposit counterpart
  const totalPayouts = totalPayoutsPerDeposit + totalProfitsNonOverlapping;
  const totalWithdrawalsAmt = (withdrawals || []).reduce(
    (s: number, w: Record<string, unknown>) => s + Number(w.amount ?? 0),
    0
  );
  const netProfit = totalDeposits - totalPayouts - totalWithdrawalsAmt;

  return NextResponse.json({
    period,
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    summary: {
      totalDeposits,
      totalPayouts,
      totalPayoutsPerDeposit,
      totalProfitsPaid,
      totalProfitsNonOverlapping,
      totalWithdrawals: totalWithdrawalsAmt,
      netProfit,
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
    },
    breakdown: {
      deposits: deposits || [],
      payouts: payouts || [],
      profitsPaid: profitsPaid || [],
      profitsNonOverlapping: nonOverlappingProfits,
      withdrawals: withdrawals || [],
    },
  });
}