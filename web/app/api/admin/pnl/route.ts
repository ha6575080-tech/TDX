import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

  const { data: deposits } = await supabaseAdmin
    .from("deposits")
    .select("amount, created_at")
    .eq("status", "approved")
    .gte("created_at", startDate.toISOString());

  const { data: payouts } = await supabaseAdmin
    .from("payouts")
    .select("amount, created_at")
    .eq("status", "paid")
    .gte("created_at", startDate.toISOString());

  const { data: withdrawals } = await supabaseAdmin
    .from("withdrawals")
    .select("amount, created_at")
    .in("status", ["approved", "completed"])
    .gte("created_at", startDate.toISOString());

  const { count: totalUsers } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const { count: activeUsers } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const totalDeposits = (deposits || []).reduce(
    (s: number, d: Record<string, unknown>) => s + (d.amount as number),
    0
  );
  const totalPayouts = (payouts || []).reduce(
    (s: number, p: Record<string, unknown>) => s + (p.amount as number),
    0
  );
  const totalWithdrawalsAmt = (withdrawals || []).reduce(
    (s: number, w: Record<string, unknown>) => s + (w.amount as number),
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
      totalWithdrawals: totalWithdrawalsAmt,
      netProfit,
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
    },
    breakdown: {
      deposits: deposits || [],
      payouts: payouts || [],
      withdrawals: withdrawals || [],
    },
  });
}