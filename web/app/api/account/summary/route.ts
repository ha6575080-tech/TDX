import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/account/summary
 *
 * AUTHORITATIVE financial summary for the authenticated user.
 * All balance math happens here, server-side — the browser only displays
 * these numbers and must never construct them itself.
 *
 * Display semantics (preserved from the previous client-side behaviour):
 *   totalDeposited = sum of APPROVED deposits
 *   totalProfit    = sum of ALL profit rows (pending + paid)
 *   totalWithdrawn = sum of ALL withdrawal rows (any status)
 *   totalBalance   = deposited + profit - withdrawn - deductions
 *
 * Authoritative withdrawable balance (used to gate withdrawals):
 *   approved deposits + PAID profits
 *   - withdrawals in ('pending','approved','completed')  [reserved or spent]
 *   - deductions
 */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const userId = user.id;
  const supabase = await createClient();

  const [profileRes, depositsRes, profitsRes, withdrawalsRes, returnsRes, upgradesRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "username, full_name, mobile_number, referral_bonus, total_deductions, package_id, profit_activation_date, is_active, is_suspended, investment_amount"
        )
        .eq("id", userId)
        .single(),
      supabase
        .from("deposits")
        .select("amount, status, approved_at, uploaded_at")
        .eq("user_id", userId),
      supabase.from("profits").select("amount, status").eq("user_id", userId),
      supabase
        .from("withdrawals")
        .select("amount, status")
        .eq("user_id", userId),
      // Return-investment state (latest request for this member).
      supabase
        .from("investment_returns")
        .select(
          "id, amount, returned_amount, status, requested_at, approved_at, expected_return_date, completed_at"
        )
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(1),
      // Pending (or latest) investment upgrade.
      supabase
        .from("investment_upgrades")
        .select(
          "id, previous_amount, requested_amount, increase_amount, status, requested_at, activated_at"
        )
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(1),
    ]);

  if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
  }

  const profile = profileRes.data;
  const deposits = depositsRes.data ?? [];
  const profits = profitsRes.data ?? [];
  const withdrawals = withdrawalsRes.data ?? [];
  const latestReturn = returnsRes.data?.[0] ?? null;
  const latestUpgrade = upgradesRes.data?.[0] ?? null;

  // ---- DISPLAY totals (same semantics as the previous client-side math) ----
  const totalDeposited = deposits
    .filter((d) => d.status === "approved")
    .reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const totalProfit = profits.reduce(
    (s, p) => s + Number(p.amount ?? 0),
    0
  );
  const totalWithdrawn = withdrawals.reduce(
    (s, w) => s + Number(w.amount ?? 0),
    0
  );
  const deductions = Number(profile?.total_deductions ?? 0);
  const totalBalance =
    totalDeposited + totalProfit - totalWithdrawn - deductions;

  // ---- AUTHORITATIVE withdrawable balance (mirrors request_withdrawal RPC) --
  const reservedOrSpent = withdrawals
    .filter((w) => ["pending", "approved", "completed"].includes(w.status))
    .reduce((s, w) => s + Number(w.amount ?? 0), 0);
  const paidProfits = profits
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const withdrawableBalance = Math.max(
    0,
    totalDeposited + paidProfits - reservedOrSpent - deductions
  );

  // ---- FINANCIAL WORKFLOW STATE (authoritative, server-derived) ----
  // Active investment mirrors the DB's active_investment() logic:
  // profiles.investment_amount (set after an activated upgrade) takes
  // precedence; otherwise derived from approved deposits.
  const activeInvestment =
    profile?.investment_amount != null
      ? Number(profile.investment_amount)
      : totalDeposited;

  // Return-investment hold: an approved, not-yet-completed return blocks
  // withdrawals and upgrades (enforced again server-side in the RPCs).
  const returnHold =
    !!latestReturn && ["requested", "approved"].includes(latestReturn.status);

  // Server-authoritative 30-day cycle state. Mirrors the
  // withdrawal_current_cycle() logic used by request_withdrawal():
  // profit_activation_date when present, otherwise earliest approved deposit.
  // Display-only — the RPC re-validates on submit.
  let cycle: {
    cycleNumber: number | null;
    cycleStart: string | null;
    cycleEnd: string | null;
    actionableAt: string | null;
    actionableNow: boolean;
  } | null = null;

  let anchorMs: number | null = null;
  if (profile?.profit_activation_date) {
    anchorMs = new Date(profile.profit_activation_date).getTime();
  } else {
    const anchors = deposits
      .filter((d) => d.status === "approved")
      .map(
        (d) =>
          new Date(
            (d.approved_at ?? d.uploaded_at ?? "9999-12-31") as string
          ).getTime()
      )
      .filter((t) => Number.isFinite(t));
    if (anchors.length > 0) anchorMs = Math.min(...anchors);
  }

  if (anchorMs != null) {
    const nowMs = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const cycleIndex = Math.floor((nowMs - anchorMs) / (30 * DAY));
    const cycleStartMs = anchorMs + cycleIndex * 30 * DAY;
    const cycleEndMs = cycleStartMs + 30 * DAY;
    const actionableAtMs = cycleEndMs - DAY;
    cycle = {
      cycleNumber: cycleIndex + 1,
      cycleStart: new Date(cycleStartMs).toISOString(),
      cycleEnd: new Date(cycleEndMs).toISOString(),
      actionableAt: new Date(actionableAtMs).toISOString(),
      actionableNow: nowMs >= actionableAtMs,
    };
  }

  return NextResponse.json({
    profile,
    display: {
      totalDeposited,
      totalProfit,
      totalWithdrawn,
      deductions,
      totalBalance,
    },
    authoritative: {
      withdrawableBalance,
      activeInvestment,
    },
    financial: {
      activeInvestment,
      returnHold,
      cycle,
      returnRequest: latestReturn,
      pendingUpgrade:
        latestUpgrade && latestUpgrade.status === "pending"
          ? latestUpgrade
          : null,
      lastUpgrade: latestUpgrade,
    },
  });
}
