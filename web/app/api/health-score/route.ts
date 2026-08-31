import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";

/**
 * GET /api/health-score
 *
 * Financial Health Score — 0-100, computed entirely from the authenticated
 * member's existing TDX data using deterministic, rule-based formulas.
 * No AI, no external services, no client-supplied financial values.
 *
 * The score is an informational overview of account activity. It is NOT
 * financial advice, and it does not predict or guarantee any outcome.
 *
 * Components (weights, each normalized 0-100):
 *  1. Account consistency     (20%) — daily-task completion over the last 30 days
 *  2. Portfolio activity      (20%) — active investment level within the product range (log scale)
 *  3. Goal progress           (15%) — progress through the current 30-day cycle + upgrade growth
 *  4. Balance stability       (20%) — deductions relative to funds in
 *  5. Transaction consistency (15%) — approval rate + months with recorded activity
 *  6. Account maturity        (10%) — account age up to one year
 *
 * Components without enough data are excluded and their weight is
 * redistributed so the overall score always reflects only measurable data.
 */

const MIN_INVESTMENT_PKR = 5_000;
const MAX_INVESTMENT_PKR = 2_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function categoryFor(score: number): string {
  if (score <= 20) return "Getting Started";
  if (score <= 40) return "Developing";
  if (score <= 60) return "Stable";
  if (score <= 80) return "Strong";
  return "Excellent";
}

interface ComponentResult {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const userId = user.id;
  const supabase = await createClient();

  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);

  const [profileRes, depositsRes, profitsRes, withdrawalsRes, tasksRes, upgradesRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "username, full_name, created_at, is_active, is_suspended, profit_activation_date, total_deductions, investment_amount"
        )
        .eq("id", userId)
        .single(),
      supabase.from("deposits").select("amount, status, uploaded_at").eq("user_id", userId),
      supabase.from("profits").select("amount, status").eq("user_id", userId),
      supabase
        .from("withdrawals")
        .select("amount, status, requested_at")
        .eq("user_id", userId),
      supabase
        .from("tasks")
        .select("task_date, completed")
        .eq("user_id", userId)
        .gte("task_date", since30),
      supabase
        .from("investment_upgrades")
        .select("previous_amount, requested_amount, increase_amount, status, activated_at")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(5),
    ]);

  if (profileRes.error) {
    return internalError("health-score", profileRes.error);
  }

  const profile = profileRes.data;
  const deposits = depositsRes.data ?? [];
  const profits = profitsRes.data ?? [];
  const withdrawals = withdrawalsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const upgrades = upgradesRes.data ?? [];
  const now = new Date();

  // ---- Authoritative aggregates (server-side only; same semantics as
  // ---- /api/account/summary — the browser never computes these).
  const approvedDeposits = deposits.filter((d) => d.status === "approved");
  const totalDeposited = approvedDeposits.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const paidProfits = profits
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const deductions = Number(profile?.total_deductions ?? 0);
  const activeInvestment =
    profile?.investment_amount != null ? Number(profile.investment_amount) : totalDeposited;

  const components: ComponentResult[] = [];
  const suggestions: string[] = [];

  // 1. Account consistency — daily-task completion over the last 30 days.
  if (tasks.length > 0) {
    const taskCompleted = tasks.filter((t) => t.completed).length;
    const taskScore = Math.round((taskCompleted / tasks.length) * 100);
    components.push({
      key: "consistency",
      label: "Account consistency",
      weight: 0.2,
      score: taskScore,
      detail: `Completed ${taskCompleted} of ${tasks.length} daily tasks in the last 30 days (${taskScore}%).`,
    });
    if (taskScore < 100) {
      suggestions.push(
        "Complete your daily tasks regularly — missed days reduce this component and add deductions."
      );
    }
  } else {
    components.push({
      key: "consistency",
      label: "Account consistency",
      weight: 0.2,
      score: null,
      detail: "No daily tasks in the last 30 days, so this component has no data.",
    });
  }

  // 2. Portfolio activity — investment level within the product range (log scale).
  if (activeInvestment > 0) {
    const lo = Math.log(MIN_INVESTMENT_PKR);
    const hi = Math.log(MAX_INVESTMENT_PKR);
    const v = clamp(activeInvestment, MIN_INVESTMENT_PKR, MAX_INVESTMENT_PKR);
    components.push({
      key: "activity",
      label: "Portfolio activity",
      weight: 0.2,
      score: Math.round(((Math.log(v) - lo) / (hi - lo)) * 100),
      detail: `Active investment is ${activeInvestment.toLocaleString("en-PK")} PKR (product range ${MIN_INVESTMENT_PKR.toLocaleString()}–${MAX_INVESTMENT_PKR.toLocaleString()} PKR).`,
    });
  } else {
    components.push({
      key: "activity",
      label: "Portfolio activity",
      weight: 0.2,
      score: null,
      detail: "No approved investment yet, so this component has no data.",
    });
  }

  // 3. Goal progress — progress through the current 30-day cycle + upgrade growth.
  let anchorMs: number | null = null;
  if (profile?.profit_activation_date) {
    anchorMs = new Date(profile.profit_activation_date).getTime();
  } else {
    const anchors = approvedDeposits
      .map((d) => new Date((d as { uploaded_at?: string }).uploaded_at ?? "9999-12-31").getTime())
      .filter((t) => Number.isFinite(t));
    if (anchors.length > 0) anchorMs = Math.min(...anchors);
  }
  if (anchorMs != null && anchorMs <= now.getTime()) {
    const elapsed = now.getTime() - anchorMs;
    const cycleIndex = Math.floor(elapsed / (30 * DAY_MS));
    const cycleProgress = Math.min(1, (elapsed % (30 * DAY_MS)) / (30 * DAY_MS));
    let growthScore = 0;
    const lastUpgrade = upgrades[0];
    if (lastUpgrade && lastUpgrade.activated_at) {
      const prev = Number(lastUpgrade.previous_amount ?? 0);
      const inc = Number(lastUpgrade.increase_amount ?? 0);
      if (prev > 0 && inc > 0) growthScore = Math.round((clamp(inc / prev, 0, 0.5) / 0.5) * 30);
    }
    components.push({
      key: "goals",
      label: "Goal progress",
      weight: 0.15,
      score: Math.round(cycleProgress * 70 + growthScore),
      detail: `Currently ${Math.round(cycleProgress * 100)}% through 30-day cycle #${cycleIndex + 1}${growthScore > 0 ? ` · investment growth contributes ${growthScore} pts` : ""}.`,
    });
  } else {
    components.push({
      key: "goals",
      label: "Goal progress",
      weight: 0.15,
      score: null,
      detail: "No active investment cycle yet, so this component has no data.",
    });
  }

  // 4. Balance stability — deductions relative to funds in.
  if (totalDeposited > 0) {
    const ratio = deductions / Math.max(totalDeposited, 1);
    components.push({
      key: "stability",
      label: "Balance stability",
      weight: 0.2,
      score: Math.round(100 * Math.max(0, 1 - Math.min(ratio, 1))),
      detail:
        deductions > 0
          ? `PKR ${deductions.toLocaleString("en-PK")} in deductions against ${totalDeposited.toLocaleString("en-PK")} PKR deposited.`
          : "No deductions recorded on the account.",
    });
    if (deductions > 0) {
      suggestions.push(
        "Deductions reduce this component — keeping daily tasks complete avoids new deductions."
      );
    }
  } else {
    components.push({
      key: "stability",
      label: "Balance stability",
      weight: 0.2,
      score: null,
      detail: "No deposits yet, so this component has no data.",
    });
  }

  // 5. Transaction consistency — approval rate + breadth of activity months.
  if (deposits.length > 0 || withdrawals.length > 0) {
    const totalDeposits = deposits.length;
    const rejected = deposits.filter((d) => d.status === "rejected").length;
    const approvalRate = totalDeposits > 0 ? (totalDeposits - rejected) / totalDeposits : 0;
    const months = new Set<string>();
    for (const d of deposits) {
      const ts = (d as { uploaded_at?: string }).uploaded_at;
      if (ts) months.add(ts.slice(0, 7));
    }
    for (const w of withdrawals) {
      const ts = (w as { requested_at?: string }).requested_at;
      if (ts) months.add(ts.slice(0, 7));
    }
    const accountAgeMonths = profile?.created_at
      ? Math.max(1, Math.ceil((now.getTime() - new Date(profile.created_at).getTime()) / (30 * DAY_MS)))
      : 1;
    const breadth = Math.min(months.size / accountAgeMonths, 1);
    components.push({
      key: "transactions",
      label: "Transaction consistency",
      weight: 0.15,
      score: Math.round(approvalRate * 60 + breadth * 40),
      detail: `${totalDeposits - rejected}/${totalDeposits} deposits approved across ${months.size} month(s) of activity.`,
    });
    if (rejected > 0) {
      suggestions.push(
        "Some deposit submissions were rejected — matching the receipt details with the entered amount helps them process smoothly."
      );
    }
  } else {
    components.push({
      key: "transactions",
      label: "Transaction consistency",
      weight: 0.15,
      score: null,
      detail: "No transactions recorded yet, so this component has no data.",
    });
  }

  // 6. Account maturity — days since registration, up to one year.
  if (profile?.created_at) {
    const days = Math.max(0, Math.floor((now.getTime() - new Date(profile.created_at).getTime()) / DAY_MS));
    components.push({
      key: "maturity",
      label: "Account maturity",
      weight: 0.1,
      score: Math.round(Math.min(days / 365, 1) * 100),
      detail: `Account age: ${days} day${days === 1 ? "" : "s"} (grows toward 100 at one year).`,
    });
  }

  // ---- Weighted overall score over the components that have data.
  const scored = components.filter(
    (c): c is ComponentResult & { score: number } => c.score != null
  );
  const emptyAccount =
    totalDeposited === 0 && deposits.length === 0 && withdrawals.length === 0;

  if (emptyAccount || scored.length === 0) {
    return NextResponse.json({
      available: false,
      message:
        "Not enough account history yet. Once you have an approved investment and some activity, your score will appear here.",
      calculatedAt: now.toISOString(),
    });
  }

  const weightSum = scored.reduce((s, c) => s + c.weight, 0);
  const overall = Math.round(scored.reduce((s, c) => s + c.score * c.weight, 0) / weightSum);
  const strongest = [...scored].sort((a, b) => b.score - a.score)[0];
  const weakest = [...scored].sort((a, b) => a.score - b.score)[0];

  if (suggestions.length === 0) {
    suggestions.push(
      "Keep completing daily tasks and maintaining steady account activity to maintain your score."
    );
  }

  return NextResponse.json({
    available: true,
    score: overall,
    category: categoryFor(overall),
    components: components.map((c) => ({
      key: c.key,
      label: c.label,
      weight: Math.round(c.weight * 100),
      score: c.score,
      detail: c.detail,
    })),
    summary: {
      componentsUsed: scored.length,
      componentsTotal: components.length,
      strongest: { label: strongest.label, score: strongest.score },
      weakest: { label: weakest.label, score: weakest.score },
      explanation: `The score reflects ${scored.length} of the tracked account areas. Your strongest area right now is ${strongest.label} (${strongest.score}/100) and the area with the most room to grow is ${weakest.label} (${weakest.score}).`,
    },
    suggestions,
    disclaimer:
      "Informational overview based on your account activity. This is not financial advice and a higher score does not indicate or guarantee any investment outcome.",
    calculatedAt: now.toISOString(),
  });
}
