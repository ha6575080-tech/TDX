import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

// GET — admin overview metrics (aggregate only; never returns raw rows).
//
// Active user definition (matches the deposit-approval flow, which sets
// is_active = true / is_suspended = false on approval):
//   active    = is_active = true  AND is_suspended = false
//   suspended = is_suspended = true
// Withdrawal lifecycle: pending -> completed (via the profit-withdrawal RPC)
// or rejected — so "completed" is the authoritative total actually withdrawn.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const [
    totalUsersRes,
    activeUsersRes,
    suspendedUsersRes,
    approvedDepositSumRes,
    pendingDepositsRes,
    completedWithdrawalsSumRes,
    pendingWithdrawalsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_suspended", false),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_suspended", true),
    supabase.from("deposits").select("amount.sum()").eq("status", "approved"),
    supabase
      .from("deposits")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("withdrawals")
      .select("amount.sum()")
      .eq("status", "completed"),
    supabase
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const firstError =
    totalUsersRes.error ||
    activeUsersRes.error ||
    suspendedUsersRes.error ||
    approvedDepositSumRes.error ||
    pendingDepositsRes.error ||
    completedWithdrawalsSumRes.error ||
    pendingWithdrawalsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const sumOf = (res: { data: Array<{ sum: number | null }> | null }) =>
    res.data?.[0]?.sum ?? 0;

  return NextResponse.json({
    totalUsers: totalUsersRes.count ?? 0,
    activeUsers: activeUsersRes.count ?? 0,
    suspendedUsers: suspendedUsersRes.count ?? 0,
    totalApprovedDeposits: sumOf(approvedDepositSumRes),
    totalWithdrawals: sumOf(completedWithdrawalsSumRes),
    pendingDeposits: pendingDepositsRes.count ?? 0,
    pendingWithdrawals: pendingWithdrawalsRes.count ?? 0,
  });
}

