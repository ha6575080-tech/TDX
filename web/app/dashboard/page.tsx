"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  ListChecks,
  History,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  User,
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  TopNav,
  BottomNav,
  GlassPanel,
  GlowButton,
  StatTile,
  Gauge,
} from "@/components/ui";
import DepositForm from "@/components/DepositForm";
import WithdrawForm from "@/components/WithdrawForm";
import ReturnInvestmentPanel, {
  type ReturnRequestState,
} from "@/components/ReturnInvestmentPanel";
import UpgradeInvestmentPanel, {
  type PendingUpgradeState,
} from "@/components/UpgradeInvestmentPanel";
import FinancialHealthCard from "@/components/FinancialHealthCard";

interface Profile {
  username: string;
  full_name: string;
  mobile_number: string;
  referral_bonus: number;
  total_deductions: number;
  package_id: string | null;
  profit_activation_date: string | null;
  is_active: boolean;
  is_suspended: boolean;
}

interface Deposit {
  id: string;
  amount: number;
  status: string;
  uploaded_at: string;
  ai_verdict: string;
}

// AUTHORITATIVE financial numbers come from the server — the browser only
// displays them and never constructs a balance itself.
interface AccountSummary {
  profile: Profile | null;
  display: {
    totalDeposited: number;
    totalProfit: number;
    totalWithdrawn: number;
    deductions: number;
    totalBalance: number;
  };
  authoritative: {
    withdrawableBalance: number;
    activeInvestment?: number;
  };
  financial?: {
    activeInvestment: number;
    returnHold: boolean;
    returnRequest: ReturnRequestState | null;
    pendingUpgrade: PendingUpgradeState | null;
    lastUpgrade: PendingUpgradeState | null;
  };
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  title_ur: string | null;
  content_ur: string | null;
  created_at: string;
}

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

function statusBadge(status: string) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold";
  switch (status) {
    case "approved":
      return `${base} bg-primary/15 text-primary border border-primary/30`;
    case "rejected":
      return `${base} bg-error/15 text-error border border-error/30`;
    case "pending":
    default:
      return `${base} bg-secondary/15 text-secondary border border-secondary/30`;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, lang } = useI18n();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<Deposit[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [financial, setFinancial] = useState<AccountSummary["financial"] | null>(
    null
  );
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

      // Ensure tasks exist + deductions applied (server-side logic via route).
      await fetch("/api/tasks/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});

      // Authoritative financials are computed SERVER-SIDE (/api/account/summary).
      // The remaining queries are display-only data.
      // NOTE: the package model has been removed from the active product —
      // members enter a free investment amount (5,000–2,000,000 PKR), so the
      // packages table is no longer queried here.
      const [summaryRes, depositsRes, annRes] = await Promise.all([
        fetch("/api/account/summary").then((r) => {
          if (!r.ok) throw new Error("Failed to load account summary.");
          return r.json() as Promise<AccountSummary>;
        }),
        supabase
          .from("deposits")
          .select("id, amount, status, uploaded_at, ai_verdict")
          .eq("user_id", userId)
          .order("uploaded_at", { ascending: false })
          .limit(10),
        supabase
          .from("announcements")
          .select("id, title, content, title_ur, content_ur, created_at")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      setProfile(summaryRes.profile as Profile);
      setRecentDeposits((depositsRes.data ?? []) as Deposit[]);
      setAnnouncement((annRes.data?.[0] ?? null) as Announcement | null);

      setTotalDeposited(summaryRes.display.totalDeposited);
      setTotalProfit(summaryRes.display.totalProfit);
      setTotalWithdrawn(summaryRes.display.totalWithdrawn);
      setFinancial(summaryRes.financial ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const username = profile?.username ?? "User";
  const referralBonus = profile?.referral_bonus ?? 0;
  const deductions = profile?.total_deductions ?? 0;
  // Server-computed authoritative balance (see /api/account/summary).
  const totalBalance =
    totalDeposited + totalProfit - totalWithdrawn - deductions;

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/dashboard" />
      <BottomNav active="/dashboard" />

      <div className="w-full max-w-7xl mx-auto px-container-padding pt-6 md:pt-8 grid grid-cols-4 md:grid-cols-12 gap-4 relative z-10">
        {/* Balance Card */}
        <section className="col-span-4 md:col-span-12">
          <GlassPanel className="p-6 relative overflow-hidden border-secondary/30">
            <div className="absolute inset-0 bg-secondary/10 opacity-50 blur-2xl" />
            <div className="relative z-10 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
              <div>
                <h2 className="text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
                  {t("totalBalance")}
                </h2>
                <div className="text-headline-xl text-secondary font-bold counter-animate">
                  {fmtPKR(totalBalance)}
                </div>
              </div>
              <div className="flex gap-4">
                <div className="bg-surface-container/50 px-4 py-2 rounded-full border border-surface-bright flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-label-md text-primary">
                    {profile?.is_active ? t("active") : t("inactive")}
                  </span>
                </div>
              </div>
            </div>
          </GlassPanel>
        </section>

        {/* Announcement banner */}
        {announcement && (
          <section className="col-span-4 md:col-span-12">
            <GlassPanel className="p-4 border-secondary/40">
              <p className="text-xs font-bold uppercase tracking-wide text-secondary">
                📢 {t("announcements")}
              </p>
              <h2 className="mt-1 font-bold text-on-surface">
                {lang === "ur" && announcement.title_ur
                  ? announcement.title_ur
                  : announcement.title}
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {lang === "ur" && announcement.content_ur
                  ? announcement.content_ur
                  : announcement.content}
              </p>
              <p className="mt-2 text-xs text-on-surface-variant/60">
                {fmtDate(announcement.created_at)}
              </p>
            </GlassPanel>
          </section>
        )}

        {/* Quick Actions */}
        <section className="col-span-4 md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="col-span-2 md:col-span-3 flex gap-4 mb-1">
            <GlowButton className="flex-1" onClick={() => document.getElementById("deposit-form")?.scrollIntoView({ behavior: "smooth" })}>
              <ArrowDownToLine className="w-5 h-5" />
              {t("deposit")}
            </GlowButton>
            <GlowButton variant="gold" className="flex-1" onClick={() => document.getElementById("withdraw-form")?.scrollIntoView({ behavior: "smooth" })}>
              <ArrowUpFromLine className="w-5 h-5" />
              {t("withdraw")}
            </GlowButton>
          </div>

          <StatTile
            icon={<Wallet className="w-5 h-5" />}
            label={t("totalDeposited")}
            value={fmtPKR(totalDeposited)}
            sub={t("active")}
          />
          <StatTile
            icon={<TrendingUp className="w-5 h-5" />}
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
          <StatTile
            icon={<User className="w-5 h-5" />}
            label={t("referralBonus")}
            value={fmtPKR(referralBonus)}
            accent="gold"
          />
          <StatTile
            icon={<ListChecks className="w-5 h-5" />}
            label={t("deductions")}
            value={fmtPKR(deductions)}
            accent="mint"
          />
        </section>

        {/* Daily Potential Gauge */}
        <section className="col-span-4 md:col-span-4">
          <GlassPanel className="p-6 flex flex-col items-center justify-center h-full min-h-[300px]">
            <h3 className="text-title-md text-on-surface mb-6 w-full text-left">
              {t("dailyPotential")}
            </h3>
            <Gauge
              percent={75}
              label={t("earned")}
              value="75%"
            />
            <div className="mt-6 text-label-md text-on-surface text-center">
              {t("greatJob")}
            </div>
          </GlassPanel>
        </section>

        {/* Financial Health Score */}
        <section className="col-span-4 md:col-span-12">
          <FinancialHealthCard />
        </section>

        {/* Profile + Recent Deposits */}
        <section className="col-span-4 md:col-span-8">
          <GlassPanel className="p-6">
            <h2 className="text-title-md text-on-surface mb-4">{t("yourProfile")}</h2>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container text-xl font-bold">
                {username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-on-surface">
                  {profile?.full_name ?? username}
                </p>
                <p className="text-sm text-on-surface-variant">@{username}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-outline-variant/30 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("mobile")}
                </p>
                <p className="font-medium">{profile?.mobile_number ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("profitOn")}
                </p>
                <p className="font-medium">
                  {fmtDate(profile?.profit_activation_date)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("status")}
                </p>
                <p className="font-medium">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      profile?.is_suspended
                        ? "bg-error/15 text-error"
                        : profile?.is_active
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-bright text-on-surface-variant"
                    }`}
                  >
                    {profile?.is_suspended
                      ? t("suspended")
                      : profile?.is_active
                      ? t("active")
                      : t("inactive")}
                  </span>
                </p>
              </div>
            </div>
          </GlassPanel>
        </section>

        {/* Deposit + Withdraw Forms (withdrawal blocked during return hold) */}
        <section id="deposit-form" className="col-span-4 md:col-span-6">
          <DepositForm />
        </section>
        <section id="withdraw-form" className="col-span-4 md:col-span-6">
          {financial?.returnHold ? (
            <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
              <h2 className="mb-3 text-lg font-bold">Withdraw Funds</h2>
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-bold">Financial activities on hold</p>
                <p className="mt-1">
                  Your withdrawal, profit, and payout activities have been
                  placed on hold because your return investment request has
                  been approved. Please expect your return investment within 60
                  days of approval.
                </p>
              </div>
            </div>
          ) : (
            <WithdrawForm />
          )}
        </section>

        {/* Return Investment + Upgrade Investment */}
        <section id="return-investment" className="col-span-4 md:col-span-6">
          <ReturnInvestmentPanel
            returnRequest={financial?.returnRequest ?? null}
            hasInvestment={(financial?.activeInvestment ?? 0) > 0}
            onRequestSubmitted={loadData}
          />
        </section>
        <section id="upgrade-investment" className="col-span-4 md:col-span-6">
          <UpgradeInvestmentPanel
            currentInvestment={financial?.activeInvestment ?? 0}
            pendingUpgrade={financial?.pendingUpgrade ?? null}
            onUpgradeSubmitted={loadData}
          />
        </section>

        {/* Recent Deposits */}
        <section className="col-span-4 md:col-span-4">
          <GlassPanel className="p-6">
            <h2 className="text-title-md text-on-surface mb-4">{t("recentDeposits")}</h2>
            {recentDeposits.length > 0 ? (
              <div className="space-y-3">
                {recentDeposits.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-on-surface">
                        {fmtPKR(d.amount)}
                      </p>
                      <span className={statusBadge(d.status)}>
                        {d.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {fmtDate(d.uploaded_at)}
                      {d.ai_verdict ? ` · AI: ${d.ai_verdict}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">{t("noDeposits")}</p>
            )}
          </GlassPanel>
        </section>

        {/* Quick Links */}
        <section className="col-span-4 md:col-span-12">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/statistics"
              className="h-11 rounded-lg bg-primary-container text-on-primary-container px-6 text-sm font-bold inline-flex items-center transition-colors hover:bg-primary-fixed"
            >
              {t("statistics")}
            </Link>
            <Link
              href="/tasks"
              className="h-11 rounded-lg bg-primary-container text-on-primary-container px-6 text-sm font-bold inline-flex items-center transition-colors hover:bg-primary-fixed"
            >
              {t("tasks")}
            </Link>
            <Link
              href="/chat"
              className="h-11 rounded-lg bg-primary-container text-on-primary-container px-6 text-sm font-bold inline-flex items-center transition-colors hover:bg-primary-fixed"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              {t("chat")}
            </Link>
            <Link
              href="/statement"
              className="h-11 rounded-lg bg-primary-container text-on-primary-container px-6 text-sm font-bold inline-flex items-center transition-colors hover:bg-primary-fixed"
            >
              {t("viewStatement")}
            </Link>
            <Link
              href="/agents"
              className="h-11 rounded-lg bg-primary-container text-on-primary-container px-6 text-sm font-bold inline-flex items-center transition-colors hover:bg-primary-fixed"
            >
              {t("agentPortal")}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}