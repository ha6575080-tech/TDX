"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import StatementExport from "@/components/StatementExport";

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

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold";
  switch (status) {
    case "approved":
    case "paid":
    case "completed":
      return `${base} bg-lime-400/15 text-lime-300 border border-lime-400/30`;
    case "rejected":
      return `${base} bg-red-400/15 text-red-300 border border-red-400/30`;
    case "pending":
    default:
      return `${base} bg-amber-400/15 text-amber-300 border border-amber-400/30`;
  }
}

interface HistoryRow {
  amount: number;
  status: string;
  created_at: string | undefined;
}

function HistoryTable({ title, rows }: { title: string; rows: HistoryRow[] }) {
  const { t } = useI18n();
  return (
    <div className="glass-panel p-4">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      {rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50">
              <th className="pb-2">{t("amountPkr")}</th>
              <th className="pb-2">{t("status")}</th>
              <th className="pb-2">{t("requestedDate")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.created_at}-${i}`} className="border-t border-white/5">
                <td className="py-2">Rs {r.amount.toLocaleString()}</td>
                <td className="py-2">
                  <span className={statusBadge(r.status)}>{r.status}</span>
                </td>
                <td className="py-2">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-white/50">{t("noStatementData")}</p>
      )}
    </div>
  );
}

function hasRows(d: StatementData | null): boolean {
  if (!d) return false;
  return (
    (d.deposits ?? []).length > 0 ||
    (d.payouts ?? []).length > 0 ||
    (d.withdrawals ?? []).length > 0
  );
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

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-white/20 border-t-lime-400 rounded-full animate-spin" />
          <p className="text-sm text-white/70">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (err) return <p className="p-6 text-red-400">{err}</p>;

  const profile = data?.profile ?? null;

  return (
    <div className="p-6 space-y-6" dir={lang === "ur" ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">{t("yourStatement")}</h1>

      {/* Profile summary card */}
      {profile && (
        <div className="glass-panel p-4">
          <h2 className="text-xl font-bold mb-3">{t("profileSummary")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
            <div>
              <span className="text-white/50 text-xs block">{t("fullName")}</span>
              <p className="font-semibold">{profile.full_name}</p>
            </div>
            <div>
              <span className="text-white/50 text-xs block">{t("username")}</span>
              <p className="font-semibold">@{profile.username}</p>
            </div>
            <div>
              <span className="text-white/50 text-xs block">{t("mobileNumber")}</span>
              <p className="font-semibold">{profile.mobile_number}</p>
            </div>
            <div>
              <span className="text-white/50 text-xs block">{t("city")}</span>
              <p className="font-semibold">{profile.city}</p>
            </div>
            <div>
              <span className="text-white/50 text-xs block">{t("status")}</span>
              <p className="font-semibold">{profile.status}</p>
            </div>
          </div>
        </div>
      )}

      {data ? <StatementExport data={data} language={lang} /> : null}

      {!hasRows(data) ? (
        <div className="glass-panel p-6 text-center">
          <p className="text-white/60">{t("noStatementData")}</p>
        </div>
      ) : (
        <>
          <HistoryTable
            title={t("depositHistory")}
            rows={(data?.deposits ?? []).map((r) => r as unknown as HistoryRow)}
          />
          <HistoryTable
            title={t("payoutHistory")}
            rows={(data?.payouts ?? []).map((p) => p as unknown as HistoryRow)}
          />
          <HistoryTable
            title={t("withdrawalHistory")}
            rows={(data?.withdrawals ?? []).map((w) => w as unknown as HistoryRow)}
          />
        </>
      )}
    </div>
  );
}
