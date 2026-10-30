import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";
import { deriveMemberStatus } from "@/lib/member-status";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const client = await createClient();
  const [profileRes, depositsRes, payoutsRes, profitsRes, withdrawalsRes] = await Promise.all([
    client.from("profiles").select("full_name, username, mobile_number, city, is_active, is_suspended, role, created_at").eq("id", user.id).single(),
    client.from("deposits").select("id, amount, status, created_at:uploaded_at").eq("user_id", user.id).order("uploaded_at", { ascending: false }),
    client.from("payouts").select("id, amount, percentage_applied, month, year, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    client.from("profits").select("id, amount, month, year, status, created_at:payout_date").eq("user_id", user.id).order("payout_date", { ascending: false }),
    client.from("withdrawals").select("id, amount, fee, net_amount, status, created_at:requested_at").eq("user_id", user.id).order("requested_at", { ascending: false }),
  ]);
  const failed = [profileRes, depositsRes, payoutsRes, profitsRes, withdrawalsRes].find((result) => result.error);
  if (failed?.error) return internalError("statements", failed.error);
  if (!profileRes.data) return internalError("statements", new Error("Missing member profile"));
  const deposits = depositsRes.data ?? [];
  const withdrawals = withdrawalsRes.data ?? [];
  const depositPayouts = payoutsRes.data ?? [];
  const paidDepositPeriods = new Set(depositPayouts.filter((p) => p.status === "paid").map((p) => p.month + "/" + p.year));
  const payouts = [...depositPayouts, ...(profitsRes.data ?? []).filter((p) => !paidDepositPeriods.has(p.month + "/" + p.year))];
  const sum = (rows: Array<{ amount: number | string | null }>) => rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
  return NextResponse.json({
    profile: { ...profileRes.data, status: profileRes.data.role === "admin" ? "admin" : deriveMemberStatus(profileRes.data) },
    deposits, payouts, withdrawals,
    summary: { totalDeposited: sum(deposits.filter((d) => d.status === "approved")), totalPayouts: sum(payouts.filter((p) => p.status === "paid")), totalWithdrawn: sum(withdrawals.filter((w) => w.status === "completed")) },
  }, { headers: { "Cache-Control": "no-store" } });
}
