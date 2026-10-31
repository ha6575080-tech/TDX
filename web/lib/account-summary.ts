/**
 * Booked account totals shared by the dashboard and goal progress.
 * Only paid profit is credited; only completed withdrawals are spent.
 * Completed principal returns retire both balance and active investment.
 * Pending/approved withdrawals reserve funds without being reported as paid.
 */

export interface SummaryProfile {
  total_deductions?: number | string | null;
  investment_amount?: number | string | null;
  profit_activation_date?: string | null;
  [key: string]: unknown;
}

export interface SummaryDeposit {
  amount: number | string | null;
  status: string;
  approved_at?: string | null;
  uploaded_at?: string | null;
}

export interface SummaryAmountRow {
  amount: number | string | null;
  status: string;
}

export function computeSummaryTotals(
  profile: SummaryProfile | null,
  deposits: SummaryDeposit[],
  profits: SummaryAmountRow[],
  withdrawals: SummaryAmountRow[],
  returns: SummaryAmountRow[] = []
) {
  // Booked amounts, excluding projections and rejected requests.
  const totalDeposited = deposits
    .filter((d) => d.status === "approved")
    .reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const totalProfit = profits.filter((p) => p.status === "paid").reduce(
    (s, p) => s + Number(p.amount ?? 0),
    0
  );
  const totalWithdrawn = withdrawals.filter((w) => w.status === "completed").reduce(
    (s, w) => s + Number(w.amount ?? 0),
    0
  );
  const deductions = Number(profile?.total_deductions ?? 0);
  const returnedPrincipal = returns.filter((r) => r.status === "completed").reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const totalBalance =
    totalDeposited + totalProfit - totalWithdrawn - returnedPrincipal - deductions;

  // ---- AUTHORITATIVE withdrawable balance (mirrors request_withdrawal RPC) --
  const reservedOrSpent = withdrawals
    .filter((w) => ["pending", "approved", "completed"].includes(w.status))
    .reduce((s, w) => s + Number(w.amount ?? 0), 0);
  const paidProfits = profits
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const withdrawableBalance = Math.max(
    0,
    totalDeposited + paidProfits - reservedOrSpent - returnedPrincipal - deductions
  );

  // ---- Active investment (mirrors the DB's active_investment() logic) ----
  const activeInvestment = Math.max(0, Math.min(totalDeposited - returnedPrincipal,
    profile?.investment_amount != null
      ? Number(profile.investment_amount)
      : totalDeposited - returnedPrincipal));

  return { totalDeposited, totalProfit, totalWithdrawn, deductions, totalBalance, withdrawableBalance, activeInvestment };
}
