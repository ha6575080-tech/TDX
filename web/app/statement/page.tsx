"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import StatementExport from "@/components/StatementExport";

interface Payout {
  id: string;
  amount: number;
  percentage_applied: number;
  month: number;
  year: number;
  status: string;
  created_at: string;
}

interface Deposit {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Profile {
  full_name: string;
  username: string;
  mobile_number: string;
  city: string;
  status: string;
  created_at: string;
}

interface StatementData {
  profile: Profile;
  deposits: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  withdrawals: Record<string, unknown>[];
  summary: {
    totalDeposited: number;
    totalPayouts: number;
    totalWithdrawn: number;
  };
}

export default function StatementPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/statements")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setErr(json.error);
        else setData(json);
      })
      .catch(() => setErr(t("forbidden") || "Failed to load"))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <p className="p-6">{t("loading")}</p>;
  if (err) return <p className="p-6 text-red-400">{err}</p>;
  if (!data) return <p className="p-6">{t("noDataForPeriod")}</p>;

  return (
    <div className="p-6 space-y-6" dir={lang === "ur" ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">{t("yourStatement")}</h1>
      <StatementExport data={data} language={lang} />

      <div className="glass-panel p-4 mt-6">
        <h2 className="text-xl font-bold mb-3">{t("recentDeposits")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50">
              <th>{t("amountPkr")}</th>
              <th>{t("status")}</th>
              <th>{t("requestedDate")}</th>
            </tr>
          </thead>
          <tbody>
            {data.deposits.map((d) => {
              const dd = d as { id: string; amount: number; status: string; created_at: string };
              return (
                <tr key={dd.id} className="border-t border-white/5">
                  <td>Rs {dd.amount.toLocaleString()}</td>
                  <td>{dd.status}</td>
                  <td>{new Date(dd.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
