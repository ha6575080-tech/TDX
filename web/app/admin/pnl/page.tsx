"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import StatementExport from "@/components/StatementExport";

interface PeriodOption {
  value: string;
  labelKey: string;
}

const PERIODS: PeriodOption[] = [
  { value: "daily", labelKey: "daily" },
  { value: "weekly", labelKey: "weekly" },
  { value: "monthly", labelKey: "monthly" },
  { value: "quarterly", labelKey: "quarterly" },
  { value: "6months", labelKey: "sixMonths" },
  { value: "yearly", labelKey: "yearly" },
];

// Shape returned by GET /api/admin/pnl — map into StatementExport's expected input
interface PnlSummary {
  totalDeposits: number;
  totalPayouts: number;
  totalWithdrawals: number;
  netProfit: number;
  totalUsers: number;
  activeUsers: number;
}

interface PnlResponse {
  period: string;
  startDate: string;
  endDate: string;
  summary: PnlSummary;
  breakdown: {
    deposits: Array<{ amount: number; created_at: string }>;
    payouts: Array<{ amount: number; created_at: string }>;
    withdrawals: Array<{ amount: number; created_at: string }>;
  };
}

export default function AdminPnlPage() {
  const { t, lang } = useI18n();
  const [pnl, setPnl] = useState<PnlResponse | null>(null);
  const [period, setPeriod] = useState("monthly");
  const [loading, setLoading] = useState(false);

  const fetchPnl = (p: string) => {
    setLoading(true);
    fetch(`/api/admin/pnl?period=${p}`)
      .then((r) => r.json())
      .then((json) => setPnl(json))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPnl(period); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pnl) {
    return <p className="p-6">{t("loading")}</p>;
  }

  // Build a StatementData-compatible object so the export component can reuse it
  const statementData = {
    profile: {
      full_name: "Admin",
      username: "admin",
      mobile_number: "-",
      city: "-",
      status: "admin",
      created_at: new Date().toISOString(),
    },
    deposits: pnl.breakdown.deposits,
    payouts: pnl.breakdown.payouts,
    withdrawals: pnl.breakdown.withdrawals,
    summary: {
      totalDeposited: pnl.summary.totalDeposits,
      totalPayouts: pnl.summary.totalPayouts,
      totalWithdrawn: pnl.summary.totalWithdrawals,
    },
  };

  const color = (v: number) => (v >= 0 ? "text-lime-400" : "text-red-400");

  return (
    <div className="p-6 space-y-6" dir={lang === "ur" ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">{t("pnlReport")}</h1>

      <div className="flex items-center gap-4">
        <label>{t("period")}</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="glass-panel px-3 py-2"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{t(p.labelKey as keyof typeof import("@/lib/i18n").translations.en)}</option>
          ))}
        </select>
      </div>

      {loading && <p>{t("loading")}</p>}

      {!loading && pnl && (
        <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
          <div>
            <span className="text-white/50 text-xs block">{t("totalInvested")}</span>
            <p className="font-bold">{pnl.summary.totalDeposits.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("totalPayoutsGiven")}</span>
            <p className="font-bold">{pnl.summary.totalPayouts.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("totalWithdrawn")}</span>
            <p className="font-bold">{pnl.summary.totalWithdrawals.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("netProfit")}</span>
            <p className={`font-bold ${color(pnl.summary.netProfit)}`}>{pnl.summary.netProfit.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("totalUsers") || "Total Users"}</span>
            <p className="font-bold">{pnl.summary.totalUsers.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("activeUsers") || "Active Users"}</span>
            <p className="font-bold">{pnl.summary.activeUsers.toLocaleString()}</p>
          </div>
        </div>
      )}

      {!loading && pnl && Object.keys(pnl.breakdown).some((k) => (pnl.breakdown as Record<string, unknown[]>)[k]?.length) && (
        <div className="glass-panel p-4">
          <h2 className="text-xl font-bold mb-3">{t("profitLossStatement")}</h2>
          <StatementExport data={statementData} language={lang} />
        </div>
      )}
    </div>
  );
}
