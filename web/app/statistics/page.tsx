"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp, Wallet, History, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel, StatTile } from "@/components/ui";

function fmtPKR(n: number): string {
  return `${(n ?? 0).toLocaleString("en-PK")} PKR`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function StatisticsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();

  const [username, setUsername] = useState("User");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [registered, setRegistered] = useState("");
  const [profitActivation, setProfitActivation] = useState("");
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [payoutDates, setPayoutDates] = useState<string[]>([]);
  const [withdrawDates, setWithdrawDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const userId = user.id;

      // Authoritative financial totals come from the server; the remaining
      // queries are display-only date lists.
      const [summaryRes, profileRes, paidRes, withdrawalsDatesRes] =
        await Promise.all([
          fetch("/api/account/summary").then((r) => {
            if (!r.ok) throw new Error("Failed to load account summary.");
            return r.json();
          }),
          supabase
            .from("profiles")
            .select("username, full_name, mobile_number, created_at, profit_activation_date")
            .eq("id", userId)
            .single(),
          supabase
            .from("profits")
            .select("payout_date")
            .eq("user_id", userId)
            .eq("status", "paid"),
          supabase
            .from("withdrawals")
            .select("requested_at")
            .eq("user_id", userId),
        ]);

      if (profileRes.error) throw profileRes.error;

      setUsername(profileRes.data?.username ?? user.email?.split("@")[0] ?? "User");
      setFullName(profileRes.data?.full_name ?? "");
      setMobile(profileRes.data?.mobile_number ?? "");
      setRegistered(profileRes.data?.created_at ?? "");
      setProfitActivation(profileRes.data?.profit_activation_date ?? "");

      setTotalDeposited(summaryRes.display.totalDeposited);
      setTotalProfit(summaryRes.display.totalProfit);
      setTotalWithdrawn(summaryRes.display.totalWithdrawn);
      setPayoutDates(
        (paidRes.data ?? [])
          .map((p) => fmtDate(p.payout_date))
          .filter((d) => d !== "—")
      );
      setWithdrawDates(
        (withdrawalsDatesRes.data ?? [])
          .map((w) => fmtDate(w.requested_at))
          .filter((d) => d !== "—")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load statistics.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/statistics" />
      <BottomNav active="/statistics" />

      <div className="w-full max-w-7xl mx-auto px-container-padding pt-6 md:pt-8 flex flex-col gap-6 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-headline-lg text-on-surface neon-text-glow">
              {t("statistics")}
            </h1>
            <p className="text-body-lg text-on-surface-variant">
              {t("systemOversight")}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <GlassPanel className="p-6">
            <p className="text-sm text-on-surface-variant">{t("loading")}</p>
          </GlassPanel>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatTile
                icon={<TrendingUp className="w-5 h-5" />}
                label={t("totalDeposited")}
                value={fmtPKR(totalDeposited)}
              />
              <StatTile
                icon={<Wallet className="w-5 h-5" />}
                label={t("totalProfit")}
                value={fmtPKR(totalProfit)}
                accent="gold"
              />
              <StatTile
                icon={<History className="w-5 h-5" />}
                label={t("totalWithdrawn")}
                value={fmtPKR(totalWithdrawn)}
                accent="gold"
              />
            </div>

            {/* Performance Table */}
            <GlassPanel className="overflow-hidden">
              <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-highest/30">
                <h2 className="text-title-md text-on-surface">
                  {t("yourProfile")}
                </h2>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-label-md text-primary flex items-center gap-2 hover:text-primary-fixed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="text-label-md text-on-surface-variant bg-surface-container/50 sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        {t("username")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        {t("fullName")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        {t("mobile")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20 text-right">
                        {t("deposited")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20 text-right">
                        {t("totalProfit")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20 text-right">
                        {t("withdrawn")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        {t("registered")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        {t("profitOn")}
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        Monthly Payout Dates
                      </th>
                      <th className="p-4 font-semibold tracking-wide border-b border-outline-variant/20">
                        Withdraw Request Dates
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-body-md text-on-surface divide-y divide-outline-variant/10">
                    <tr className="hover:bg-surface-bright/50 transition-colors">
                      <td className="p-4 font-medium">@{username}</td>
                      <td className="p-4">{fullName || "—"}</td>
                      <td className="p-4">{mobile || "—"}</td>
                      <td className="p-4 text-right font-mono text-primary">
                        {fmtPKR(totalDeposited)}
                      </td>
                      <td className="p-4 text-right font-mono text-secondary font-semibold">
                        {fmtPKR(totalProfit)}
                      </td>
                      <td className="p-4 text-right font-mono">
                        {fmtPKR(totalWithdrawn)}
                      </td>
                      <td className="p-4">{fmtDate(registered)}</td>
                      <td className="p-4">{fmtDate(profitActivation)}</td>
                      <td className="p-4">
                        {payoutDates.length > 0 ? payoutDates.join(", ") : "—"}
                      </td>
                      <td className="p-4">
                        {withdrawDates.length > 0 ? withdrawDates.join(", ") : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </>
        )}

        <p className="text-center text-sm text-on-surface-variant">
          <Link href="/dashboard" className="text-primary hover:underline">
            {t("backToDashboard")}
          </Link>
        </p>
      </div>
    </main>
  );
}