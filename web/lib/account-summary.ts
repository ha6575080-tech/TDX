/**
 * AUTHORITATIVE account summary math — shared by /api/account/summary and
 * /api/goals (goal progress). PURE CODE MOTION from the summary route:
 * every expression below is moved verbatim; no calculation is changed.
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
  withdrawals: SummaryAmountRow[]
) {
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

  // ---- Active investment (mirrors the DB's active_investment() logic) ----
  const activeInvestment =
    profile?.investment_amount != null
      ? Number(profile.investment_amount)
      : totalDeposited;

  return { totalDeposited, totalProfit, totalWithdrawn, deductions, totalBalance, withdrawableBalance, activeInvestment };
}
