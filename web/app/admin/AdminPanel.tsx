"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  Activity,
  Gauge as GaugeIcon,
  AlertTriangle,
  Users,
  Wallet,
  Check,
  X,
  KeyRound,
  Download,
  Printer,
  Send,
  Trash2,
  Bell,
  Banknote,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { GlassPanel, FeedItem, Gauge } from "@/components/ui";
import ReceiptGenerator, { type ReceiptData } from "@/components/ReceiptGenerator";

type Tab =
  | "overview"
  | "users"
  | "deposits"
  | "withdrawals"
  | "announcements"
  | "payouts"
  | "returns"
  | "upgrades"
  | "notifications"
  | "chat";

interface Overview {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalApprovedDeposits: number;
  totalWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

interface UserRow {
  id: string;
  full_name: string;
  username: string;
  mobile_number: string;
  account_number: string;
  payment_method: string;
  city: string;
  address: string;
  is_active: boolean;
  is_suspended: boolean;
  created_at: string;
  profit_activation_date: string | null;
  total_deposited: number;
  total_withdrawn: number;
}

interface DepositRow {
  id: string;
  amount: number;
  receipt_image_url: string | null;
  ai_verdict: string;
  ai_confidence: number;
  status: string;
  created_at: string;
  fullName: string;
  username: string;
  mobile: string;
  packageName: string;
}

interface WithdrawalRow {
  id: string;
  amount: number | null;
  fee: number | null;
  net_amount: number | null;
  status: string;
  user_details: Record<string, string> | null;
  requested_at: string;
  monthly_profit_rate: number | null;
  cycle_number: number | null;
  cycle_start: string | null;
  cycle_end: string | null;
  fullName: string;
  username: string;
  mobile: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  title_ur: string | null;
  content_ur: string | null;
  created_at: string;
}

interface PayoutRow {
  id: string;
  month: number;
  year: number;
  amount: number;
  status: string;
  payout_date: string | null;
  dueSoon: boolean;
  fullName: string;
  username: string;
}

interface ReturnRow {
  id: string;
  amount: number | null;
  returned_amount: number | null;
  status: string;
  created_at: string;
  approved_at: string | null;
  expected_return_date: string | null;
  completed_at: string | null;
  fullName: string;
  username: string;
  mobile: string;
}

interface UpgradeRow {
  id: string;
  previous_amount: number;
  requested_amount: number;
  increase_amount: number;
  status: string;
  requested_at: string;
  activated_at: string | null;
  activated_after_entity: string | null;
  decided_at: string | null;
  decision_note: string | null;
  fullName: string;
  username: string;
  mobile: string;
}

interface ChatUser {
  id: string;
  fullName: string;
  username: string;
  mobile: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

interface ChatMsg {
  id: string;
  sender: string;
  message: string;
  message_ur?: string | null;
  created_at: string;
}

interface NotifRow {
  id: string;
  title: string;
  message: string;
  target: string;
  created_at: string;
  read_count: number;
  total_count: number;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Activity className="w-4 h-4" /> },
  { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
  { id: "deposits", label: "Deposits", icon: <Wallet className="w-4 h-4" /> },
  { id: "withdrawals", label: "Withdrawals", icon: <Banknote className="w-4 h-4" /> },
  { id: "announcements", label: "Announcements", icon: <Bell className="w-4 h-4" /> },
  { id: "payouts", label: "Payouts", icon: <GaugeIcon className="w-4 h-4" /> },
  { id: "returns", label: "Returns", icon: <AlertTriangle className="w-4 h-4" /> },
  { id: "upgrades", label: "Upgrades", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
  { id: "chat", label: "Chat", icon: <MessageCircle className="w-4 h-4" /> },
];

function fmtPKR(n: number | null | undefined): string {
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

function esc(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Focused user print: opens a dedicated print window containing ONLY the
// selected user's details (read-only) — never the surrounding Control Room
// UI, other users, or action buttons.
function printUser(u: UserRow): void {
  const status = u.is_suspended
    ? "Suspended"
    : u.is_active
    ? "Active"
    : "Inactive";

  const rows: Array<[string, string]> = [
    ["Name", esc(u.full_name) || "—"],
    ["Username", u.username ? `@${esc(u.username)}` : "—"],
    ["Mobile", esc(u.mobile_number) || "—"],
    ["Account Number", esc(u.account_number) || "—"],
    ["Payment Method", esc(u.payment_method) || "—"],
    ["City", esc(u.city) || "—"],
    ["Address", esc(u.address) || "—"],
    ["Status", status],
    ["Registration Date", fmtDate(u.created_at)],
    [
      "Profit Activation Date",
      u.profit_activation_date ? fmtDate(u.profit_activation_date) : "—",
    ],
    ["Total Deposited", fmtPKR(u.total_deposited)],
    ["Total Withdrawn", fmtPKR(u.total_withdrawn)],
  ];

  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return; // popup blocked — admin can allow popups and retry

  w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>User Details — ${esc(u.full_name) || esc(u.username)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, Arial, sans-serif; color: #1b1b1b; margin: 0; }
  .brand { font-size: 11px; letter-spacing: 3px; color: #65a30d; font-weight: 700; }
  h1 { font-size: 20px; margin: 2px 0 4px; }
  .meta { font-size: 11px; color: #6b7280; margin: 0 0 14px; }
  h2 { font-size: 15px; margin: 0 0 10px; border-bottom: 2px solid #65a30d; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 4px; font-size: 13px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  td.k { width: 40%; font-weight: 600; color: #374151; }
</style>
</head>
<body>
  <div class="brand">TDX INVESTMENT</div>
  <h1>User Details</h1>
  <p class="meta">Generated ${new Date().toLocaleString("en-PK")}</p>
  <h2>USER DETAILS</h2>
  <table>
    ${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join("")}
  </table>
</body>
</html>`);
  w.document.close();
  w.focus();
  w.print();
}

export default function AdminPanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [upgrades, setUpgrades] = useState<UpgradeRow[]>([]);
  const [notifications, setNotifications] = useState<NotifRow[]>([]);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [chatThread, setChatThread] = useState<ChatMsg[]>([]);
  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null);
  const [chatReply, setChatReply] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifTitleUr, setNotifTitleUr] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifMessageUr, setNotifMessageUr] = useState("");
  const [notifAll, setNotifAll] = useState(true);
  const [notifUserId, setNotifUserId] = useState("");
  const [annTitle, setAnnTitle] = useState("");
  const [annTitleUr, setAnnTitleUr] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annContentUr, setAnnContentUr] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // Per-pending-withdrawal Super Admin rate selection (7/8/9/10).
  const [rateSelections, setRateSelections] = useState<Record<string, number>>(
    {}
  );
  // Per-row receipt generation (deposits / payouts tabs).
  const [receiptTarget, setReceiptTarget] = useState<{
    type: "deposit" | "payout";
    id: string;
  } | null>(null);
  const [receiptLang, setReceiptLang] = useState<"en" | "ur">("en");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null);

  const openReceiptModal = (type: "deposit" | "payout", id: string) => {
    setReceiptTarget({ type, id });
    setReceiptLang("en");
    setReceiptData(null);
    setReceiptMsg(null);
  };

  async function generateReceipt() {
    if (!receiptTarget) return;
    setReceiptBusy(true);
    setReceiptMsg(null);
    setReceiptData(null);
    try {
      const r = await fetch("/api/admin/receipt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: receiptTarget.type,
          id: receiptTarget.id,
          language: receiptLang,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setReceiptMsg(t("receiptFailed"));
      } else {
        setReceiptData(json.receipt as ReceiptData);
        setReceiptMsg(t("receiptGenerated"));
      }
    } catch {
      setReceiptMsg(t("receiptFailed"));
    } finally {
      setReceiptBusy(false);
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, us, dp, wd, an, po, rt, ug] = await Promise.all([
        // Overview is fetched separately so a failure shows a clear
        // error state instead of silently rendering seven zeroes — and
        // does not block the rest of the admin data.
        fetch("/api/admin/overview").then(async (r) => {
          if (!r.ok) return { __error: "Unable to load overview metrics. Please refresh." };
          return await r.json();
        }),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/deposits").then((r) => r.json()),
        fetch("/api/admin/withdrawals").then((r) => r.json()),
        fetch("/api/admin/announcements").then((r) => r.json()),
        fetch("/api/admin/payouts").then((r) => r.json()),
        fetch("/api/admin/returns").then((r) => r.json()),
        fetch("/api/admin/upgrades").then((r) => r.json()),
      ]);
      setOverview(
        ov && typeof ov === "object" && "__error" in ov ? null : (ov as Overview)
      );
      if (ov && typeof ov === "object" && "__error" in ov) {
        setError((ov as { __error: string }).__error);
      } else {
        setError(null);
      }
      setUsers(us.users ?? []);
      setDeposits(dp.deposits ?? []);
      setWithdrawals(wd.withdrawals ?? []);
      setAnnouncements(an.announcements ?? []);
      setPayouts(po.payouts ?? []);
      setReturns(rt.returns ?? []);
      setUpgrades(ug.upgrades ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    const res = await fetch("/api/admin/notifications");
    const data = await res.json();
    if (res.ok) setNotifications(data.notifications ?? []);
  }, []);

  const loadChatUsers = useCallback(async () => {
    const res = await fetch("/api/admin/chat");
    const data = await res.json();
    if (res.ok) setChatUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    loadAll();
    loadNotifications();
    loadChatUsers();
  }, [loadAll, loadNotifications, loadChatUsers]);

  const loadChatThread = useCallback(async (userId: string) => {
    setSelectedChatUser(userId);
    const res = await fetch(`/api/admin/chat?userId=${userId}`);
    const data = await res.json();
    if (res.ok) setChatThread(data.messages ?? []);
  }, []);

  const toggleSuspend = useCallback(
    async (u: UserRow) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, action: "toggle_suspend" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to toggle suspension");
        return;
      }
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id ? { ...x, is_suspended: data.is_suspended } : x
        )
      );
      setActionMsg(
        `User ${u.full_name || u.username} ${data.is_suspended ? "suspended" : "activated"}.`
      );
    },
    []
  );

  const resetPassword = useCallback(
    async (u: UserRow) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, action: "reset_password" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to reset password");
        return;
      }
      setActionMsg(`Temporary password: ${data.temporaryPassword} (shown once)`);
    },
    []
  );

  const approveDeposit = useCallback(
    async (d: DepositRow, action: "approve" | "reject") => {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: d.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      setActionMsg(
        action === "approve"
          ? `Deposit ${d.amount} PKR approved.`
          : `Deposit ${d.amount} PKR marked as not received.`
      );
      await loadAll();
    },
    [loadAll]
  );

  const handleWithdrawal = useCallback(
    async (
      w: WithdrawalRow,
      action: "complete" | "reject",
      rate?: number
    ) => {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalId: w.id,
          action,
          monthlyProfitRate: rate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      setActionMsg(
        action === "complete"
          ? `Withdrawal completed at ${rate}% — profit ${data.profit ?? 0} PKR, net ${data.net ?? 0} PKR.`
          : `Withdrawal rejected.`
      );
      await loadAll();
    },
    [loadAll]
  );

  const publishAnnouncement = useCallback(async () => {
    if (!annTitle || !annContent) {
      setError("Title and content are required.");
      return;
    }
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish",
        title: annTitle,
        content: annContent,
        title_ur: annTitleUr,
        content_ur: annContentUr,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to publish");
      return;
    }
    setAnnTitle("");
    setAnnTitleUr("");
    setAnnContent("");
    setAnnContentUr("");
    setActionMsg("Announcement published.");
    await loadAll();
  }, [annTitle, annContent, annTitleUr, annContentUr, loadAll]);

  const deleteAnnouncement = useCallback(
    async (id: string) => {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      setActionMsg("Announcement deleted.");
      await loadAll();
    },
    [loadAll]
  );

  const handlePayout = useCallback(
    async (p: PayoutRow, action: "payout" | "remind") => {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profitId: p.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      setActionMsg(
        action === "payout"
          ? `Payout ${p.amount} PKR sent.`
          : "Reminder email sent."
      );
      await loadAll();
    },
    [loadAll]
  );

  const handleReturn = useCallback(
    async (r: ReturnRow, action: "approve" | "reject" | "mark_completed") => {
      const res = await fetch("/api/admin/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnId: r.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      setActionMsg(
        action === "approve"
          ? `Return request for ${r.fullName} approved — member is now on financial hold for 60 days.`
          : action === "mark_completed"
          ? `Investment of ${fmtPKR(Number(r.amount ?? 0))} marked as returned for ${r.fullName}.`
          : `Return request for ${r.fullName} rejected.`
      );
      await loadAll();
    },
    [loadAll]
  );

  const handleUpgradeReject = useCallback(
    async (u: UpgradeRow) => {
      const res = await fetch("/api/admin/upgrades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgradeId: u.id, action: "reject" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      setActionMsg(`Upgrade request for ${u.fullName} rejected.`);
      await loadAll();
    },
    [loadAll]
  );

  const sendNotification = useCallback(async () => {
    if (!notifTitle || !notifMessage) {
      setError("Title and message are required.");
      return;
    }
    if (!notifAll && !notifUserId) {
      setError("Please select a user.");
      return;
    }
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: notifTitle,
        message: notifMessage,
        title_ur: notifTitleUr,
        message_ur: notifMessageUr,
        target: notifAll ? "all" : "specific",
        user_id: notifAll ? undefined : notifUserId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to send notification");
      return;
    }
    setNotifTitle("");
    setNotifTitleUr("");
    setNotifMessage("");
    setNotifMessageUr("");
    setNotifUserId("");
    setActionMsg(t("notificationSent"));
    await loadNotifications();
  }, [notifTitle, notifMessage, notifTitleUr, notifMessageUr, notifAll, notifUserId, loadNotifications, t]);

  const sendAdminReply = useCallback(async () => {
    if (!selectedChatUser || !chatReply.trim()) return;
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedChatUser, text: chatReply }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to send reply");
      return;
    }
    setChatReply("");
    setActionMsg("Reply sent.");
    await loadChatThread(selectedChatUser);
    await loadChatUsers();
  }, [selectedChatUser, chatReply, loadChatThread, loadChatUsers]);

  const exportCsv = (type: string) => {
    window.open(`/api/admin/export/${type}`, "_blank");
  };

  const pendingDeposits = deposits
    .filter((d) => d.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime()
    );
  const pendingPayouts = payouts.filter((p) => p.status === "pending");
  const pendingReturns = returns.filter((r) => r.status === "requested");
  const approvedReturns = returns.filter((r) => r.status === "approved");
  const pendingUpgrades = upgrades.filter((u) => u.status === "pending");

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-6 pt-20">
      {/* Top Nav */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-md shadow-primary/10">
        <div className="flex justify-between items-center px-container-padding h-16 w-full max-w-7xl mx-auto">
          <div className="text-headline-lg font-bold text-primary">
            {t("appName")}
          </div>
          <span className="bg-primary/10 text-primary border border-primary px-3 py-1 rounded-full text-label-sm animate-pulse-glow">
            {t("admin")}
          </span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-container-padding min-h-screen flex flex-col gap-6">
        <header className="mt-4 mb-2">
          <h1 className="text-headline-xl text-primary drop-shadow-[0_0_10px_rgba(208,255,130,0.3)]">
            {t("controlRoom")}
          </h1>
          <p className="text-body-lg text-on-surface-variant mt-1">
            {t("systemOversight")}
          </p>
        </header>

        {/* Tab nav */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`h-10 rounded-lg px-4 text-sm font-semibold flex items-center gap-2 transition-colors ${
                tab === tb.id
                  ? "btn-3d-lime"
                  : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-bright"
              }`}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
          <Link
            href="/admin/receipts"
            className="h-10 rounded-lg px-4 text-sm font-semibold flex items-center gap-2 transition-colors bg-surface-container-highest text-on-surface-variant hover:bg-surface-bright"
          >
            <Printer className="w-4 h-4" />
            {t("receipt")}
          </Link>
        </div>

        {actionMsg && (
          <div className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-3 text-sm text-primary">
            {actionMsg}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="min-h-[60vh] flex flex-col gap-6">
            {[0, 1, 2, 3].map((i) => (
              <GlassPanel key={i} className="h-[400px] animate-pulse">
                <span />
              </GlassPanel>
            ))}
          </div>
        ) : tab === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-fr">
            <GlassPanel className="p-6 flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-4 border-b border-outline-variant/30 pb-2">
                <h2 className="text-title-md text-on-surface flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  {t("liveActivity")}
                </h2>
                <span className="bg-primary/10 text-primary border border-primary px-3 py-1 rounded-full text-label-sm animate-pulse-glow">
                  {t("live")}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-2">
                <FeedItem
                  icon={<Users className="w-4 h-4" />}
                  title={`New user registration (${overview?.totalUsers ?? 0} total)`}
                  meta="System overview"
                />
                <FeedItem
                  icon={<Wallet className="w-4 h-4" />}
                  title={`Total approved ${fmtPKR(overview?.totalApprovedDeposits ?? 0)}`}
                  meta="All time deposits"
                  accent="gold"
                />
                <FeedItem
                  icon={<AlertTriangle className="w-4 h-4" />}
                  title={`${overview?.pendingDeposits ?? 0} deposits awaiting approval`}
                  meta="Action required"
                  accent="mint"
                />
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 flex flex-col items-center justify-center relative overflow-hidden neon-glow-secondary h-[400px]">
              <div className="absolute top-6 left-6 right-6 flex justify-between items-center border-b border-outline-variant/30 pb-2 z-10">
                <h2 className="text-title-md text-on-surface flex items-center gap-2">
                  <GaugeIcon className="w-5 h-5 text-secondary" />
                  {t("globalProfit")}
                </h2>
              </div>
              <Gauge percent={75} label={t("yieldRate")} value="75%" color="gold" />
              <div className="mt-4 text-center z-10">
                <p className="text-headline-lg-mobile text-on-surface">
                  {fmtPKR(overview?.totalApprovedDeposits ?? 0)}
                </p>
                <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                  {t("totalLiquidity")}
                </p>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-4 border-b border-outline-variant/30 pb-2">
                <h2 className="text-title-md text-on-surface flex items-center gap-2">
                  <GaugeIcon className="w-5 h-5 text-tertiary" />
                  {t("systemHealth")}
                </h2>
                <span className="bg-tertiary/10 text-tertiary border border-tertiary px-3 py-1 rounded-full text-label-sm">
                  {t("optimal")}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-4 justify-center">
                <HealthMetric label={t("totalUsers")} value={`${overview?.totalUsers ?? 0}`} percent={50} color="lime" />
                <HealthMetric
                  label={t("activeUsers")}
                  value={`${overview?.activeUsers ?? 0}`}
                  percent={
                    overview?.totalUsers
                      ? Math.round(((overview.activeUsers ?? 0) / overview.totalUsers) * 100)
                      : 0
                  }
                  color="mint"
                />
                <HealthMetric label={t("suspendedUsers")} value={`${overview?.suspendedUsers ?? 0}`} percent={10} color="gold" />
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-4 border-b border-outline-variant/30 pb-2">
                <h2 className="text-title-md text-on-surface flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-error" />
                  {t("actionRequired")}
                </h2>
                <span className="bg-surface-bright text-on-surface px-3 py-1 rounded-full text-label-sm">
                  {overview?.pendingDeposits ?? 0} {t("pending")}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-2">
                {pendingDeposits.length === 0 && (
                  <p className="text-sm text-on-surface-variant">No pending approvals.</p>
                )}
                {pendingDeposits.slice(0, 3).map((d) => (
                  <div key={d.id} className="bg-surface-container rounded-lg p-4 border border-outline-variant/50 hover:bg-surface-container-high transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-label-md text-on-surface">{d.fullName}</h3>
                        <p className="text-label-sm text-on-surface-variant mt-1">
                          {fmtPKR(d.amount)} · {d.packageName}
                        </p>
                      </div>
                      <AlertTriangle className="w-5 h-5 text-secondary" />
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => approveDeposit(d, "approve")} className="flex-1 btn-3d-lime h-10 rounded-lg text-label-md flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => approveDeposit(d, "reject")} className="flex-1 btn-danger-3d h-10 rounded-lg text-label-md flex items-center justify-center gap-1">
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        ) : tab === "users" ? (
          <GlassPanel className="overflow-hidden">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-highest/30">
              <h2 className="text-title-md text-on-surface">{t("users")}</h2>
              <div className="flex gap-2">
                <button onClick={() => exportCsv("users")} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                  <Download className="w-3 h-3" /> {t("export")}
                </button>
                <span className="h-9 flex items-center rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface-variant">
                  <Printer className="w-3 h-3 mr-1" /> {t("printPdf")}: use the print button in a user's Actions column
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                    <th className="px-4 py-3">{t("name")}</th>
                    <th className="px-4 py-3">{t("username")}</th>
                    <th className="px-4 py-3">{t("mobile")}</th>
                    <th className="px-4 py-3">{t("account")}</th>
                    <th className="px-4 py-3">{t("payment")}</th>
                    <th className="px-4 py-3">{t("deposited")}</th>
                    <th className="px-4 py-3">{t("withdrawn")}</th>
                    <th className="px-4 py-3">{t("status")}</th>
                    <th className="px-4 py-3">{t("registered")}</th>
                    <th className="px-4 py-3">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-bright/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
                      <td className="px-4 py-3">@{u.username || "—"}</td>
                      <td className="px-4 py-3">{u.mobile_number || "—"}</td>
                      <td className="px-4 py-3">{u.account_number || "—"}</td>
                      <td className="px-4 py-3">{u.payment_method || "—"}</td>
                      <td className="px-4 py-3 text-primary">{fmtPKR(u.total_deposited)}</td>
                      <td className="px-4 py-3">{fmtPKR(u.total_withdrawn)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          u.is_suspended
                            ? "bg-error/15 text-error border border-error/30"
                            : u.is_active
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-surface-bright text-on-surface-variant"
                        }`}>
                          {u.is_suspended ? t("suspended") : u.is_active ? t("active") : t("inactive")}
                        </span>
                      </td>
                      <td className="px-4 py-3">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => printUser(u)} title={t("printPdf")} aria-label={`Print details for ${u.full_name || u.username || "user"}`} className="h-8 rounded bg-surface-bright px-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high">
                            <Printer className="w-3 h-3" />
                          </button>
                          <button onClick={() => toggleSuspend(u)} className="h-8 rounded bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high">
                            {u.is_suspended ? t("activate") : t("suspend")}
                          </button>
                          <button onClick={() => resetPassword(u)} className="h-8 rounded bg-secondary/10 px-3 text-xs font-semibold text-secondary border border-secondary/30 hover:bg-secondary/20">
                            <KeyRound className="w-3 h-3 mr-1 inline" />
                            {t("resetPassword")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-6 text-center text-on-surface-variant">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        ) : tab === "deposits" ? (
          <div className="space-y-6">
            <div className="flex justify-end gap-2">
              <button onClick={() => exportCsv("deposits")} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Download className="w-3 h-3" /> {t("export")}
              </button>
              <button onClick={() => window.print()} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Printer className="w-3 h-3" /> {t("printPdf")}
              </button>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">{t("verificationQueue")}</h2>
              {pendingDeposits.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">No pending deposits.</p></GlassPanel>
              )}
              {pendingDeposits.map((d) => (
                <GlassPanel key={d.id} className="p-4 mb-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{d.fullName} <span className="text-xs font-normal text-on-surface-variant">@{d.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{d.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{fmtPKR(d.amount)}</p>
                      <p className="text-xs text-on-surface-variant">{d.packageName}</p>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex rounded-full bg-secondary/15 px-3 py-1 font-semibold text-secondary border border-secondary/30">{d.status}</span>
                    <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 font-semibold text-primary border border-primary/30">AI: {d.ai_verdict || "unsure"} ({d.ai_confidence ?? 0}%)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => approveDeposit(d, "approve")} className="btn-3d-lime h-9 rounded-lg px-4 text-sm font-bold">
                      <Check className="w-4 h-4 mr-1 inline" /> {t("webApprove")}
                    </button>
                    <button onClick={() => approveDeposit(d, "reject")} className="btn-danger-3d h-9 rounded-lg px-4 text-sm font-semibold">
                      <X className="w-4 h-4 mr-1 inline" /> {t("notReceived")}
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("allDeposits")}</h2>
              <GlassPanel className="overflow-x-auto p-4">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t("name")}</th>
                      <th className="px-3 py-2">{t("mobile")}</th>
                      <th className="px-3 py-2">{t("deposited")}</th>
                      <th className="px-3 py-2">AI</th>
                      <th className="px-3 py-2">{t("status")}</th>
                      <th className="px-3 py-2">{t("registered")}</th>
                      <th className="px-3 py-2">{t("receipt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map((d) => (
                      <tr key={d.id} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2"><p className="font-medium">{d.fullName}</p><p className="text-xs text-on-surface-variant">@{d.username}</p></td>
                        <td className="px-3 py-2">{d.mobile}</td>
                        <td className="px-3 py-2 text-primary">{fmtPKR(d.amount)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            d.ai_verdict === "real" ? "bg-primary/15 text-primary" : d.ai_verdict === "fake" ? "bg-error/15 text-error" : "bg-secondary/15 text-secondary"
                          }`}>{d.ai_verdict || "unsure"}</span>
                        </td>
                        <td className="px-3 py-2"><span className={statusBadgeCls(d.status)}>{d.status}</span></td>
                        <td className="px-3 py-2">{fmtDate(d.created_at)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => openReceiptModal("deposit", d.id)}
                            className="btn-3d-lime h-8 rounded-lg px-3 text-xs font-bold whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3 mr-1 inline" />
                            {t("generateReceipt")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            </div>
          </div>
        ) : tab === "withdrawals" ? (
          <div className="space-y-6">
            <div className="flex justify-end gap-2">
              <button onClick={() => exportCsv("withdrawals")} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Download className="w-3 h-3" /> {t("export")}
              </button>
              <button onClick={() => window.print()} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Printer className="w-3 h-3" /> {t("printPdf")}
              </button>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">{t("withdrawals")}</h2>
              {pendingWithdrawals.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">{t("noWithdrawals")}</p></GlassPanel>
              )}
              {pendingWithdrawals.map((w) => (
                <GlassPanel key={w.id} className="p-4 mb-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{w.fullName} <span className="text-xs font-normal text-on-surface-variant">@{w.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{w.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{fmtPKR(w.amount)}</p>
                      <p className="text-xs text-on-surface-variant">{t("fee")}: {fmtPKR(w.fee)} · {t("net")}: {fmtPKR(w.net_amount)}</p>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex rounded-full bg-secondary/15 px-3 py-1 font-semibold text-secondary border border-secondary/30">{w.status}</span>
                    <span className="text-on-surface-variant">{t("requestedDate")}: {fmtDate(w.requested_at)}</span>
                  </div>
                  {w.user_details && (
                    <div className="mb-3 rounded bg-surface-container-low p-3 text-xs text-on-surface-variant">
                      <p className="font-semibold text-on-surface mb-1">{t("userDetails")}:</p>
                      <p>{w.user_details.fullName ?? ""} · {w.user_details.address ?? ""} · {w.user_details.mobileNumber ?? ""} · {w.user_details.accountNumber ?? ""} · {w.user_details.paymentMethod ?? ""}</p>
                    </div>
                  )}
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <label className="text-sm font-semibold text-on-surface">
                      Monthly Profit Rate
                    </label>
                    <select
                      value={rateSelections[w.id] ?? ""}
                      onChange={(e) =>
                        setRateSelections((prev) => ({
                          ...prev,
                          [w.id]: Number(e.target.value),
                        }))
                      }
                      className="h-9 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary"
                    >
                      <option value="" disabled>
                        Select rate…
                      </option>
                      <option value={7}>7%</option>
                      <option value={8}>8%</option>
                      <option value={9}>9%</option>
                      <option value={10}>10%</option>
                    </select>
                    {w.cycle_number != null && (
                      <span className="text-xs text-on-surface-variant">
                        Cycle #{w.cycle_number}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() =>
                        handleWithdrawal(
                          w,
                          "complete",
                          rateSelections[w.id]
                        )
                      }
                      disabled={!rateSelections[w.id]}
                      className="btn-3d-lime h-9 rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 mr-1 inline" /> {t("markCompleted")}
                    </button>
                    <button onClick={() => handleWithdrawal(w, "reject")} className="btn-danger-3d h-9 rounded-lg px-4 text-sm font-semibold">
                      <X className="w-4 h-4 mr-1 inline" /> {t("reject")}
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("allWithdrawals")}</h2>
              <GlassPanel className="overflow-x-auto p-4">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t("name")}</th>
                      <th className="px-3 py-2">{t("mobile")}</th>
                      <th className="px-3 py-2">{t("deposited")}</th>
                      <th className="px-3 py-2">{t("fee")}</th>
                      <th className="px-3 py-2">{t("net")}</th>
                      <th className="px-3 py-2">{t("status")}</th>
                      <th className="px-3 py-2">{t("requestedDate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2"><p className="font-medium">{w.fullName}</p><p className="text-xs text-on-surface-variant">@{w.username}</p></td>
                        <td className="px-3 py-2">{w.mobile}</td>
                        <td className="px-3 py-2 text-primary">{fmtPKR(w.amount)}</td>
                        <td className="px-3 py-2">{fmtPKR(w.fee)}</td>
                        <td className="px-3 py-2">{fmtPKR(w.net_amount)}</td>
                        <td className="px-3 py-2"><span className={statusBadgeCls(w.status)}>{w.status}</span></td>
                        <td className="px-3 py-2">{fmtDate(w.requested_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            </div>
          </div>
        ) : tab === "announcements" ? (
          <div className="space-y-6">
            <GlassPanel className="p-6">
              <h2 className="text-title-md text-on-surface mb-4">{t("announcements")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("titleEn")}</label>
                  <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("titleUr")}</label>
                  <input value={annTitleUr} onChange={(e) => setAnnTitleUr(e.target.value)} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("contentEn")}</label>
                  <textarea value={annContent} onChange={(e) => setAnnContent(e.target.value)} rows={3} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("contentUr")}</label>
                  <textarea value={annContentUr} onChange={(e) => setAnnContentUr(e.target.value)} rows={3} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
              </div>
              <button onClick={publishAnnouncement} className="btn-3d-lime h-10 rounded-lg px-6 text-sm font-bold mt-4">
                <Send className="w-4 h-4 mr-1 inline" /> {t("publish")}
              </button>
            </GlassPanel>

            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("allAnnouncements")}</h2>
              {announcements.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">{t("noAnnouncements")}</p></GlassPanel>
              )}
              {announcements.map((a) => (
                <GlassPanel key={a.id} className="p-4 mb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{a.title}</p>
                      {a.title_ur && <p className="text-sm text-secondary">{a.title_ur}</p>}
                      <p className="text-sm text-on-surface-variant mt-1">{a.content}</p>
                      {a.content_ur && <p className="text-sm text-on-surface-variant">{a.content_ur}</p>}
                      <p className="text-xs text-on-surface-variant mt-1">{fmtDate(a.created_at)}</p>
                    </div>
                    <button onClick={() => deleteAnnouncement(a.id)} className="h-8 rounded bg-error/10 px-3 text-xs font-semibold text-error border border-error/30 hover:bg-error/20 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> {t("delete")}
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
          </div>
        ) : tab === "payouts" ? (
          <div className="space-y-6">
            <div className="flex justify-end gap-2">
              <button onClick={() => exportCsv("payouts")} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Download className="w-3 h-3" /> {t("export")}
              </button>
              <button onClick={() => window.print()} className="h-9 rounded-lg bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high flex items-center gap-1">
                <Printer className="w-3 h-3" /> {t("printPdf")}
              </button>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">{t("payouts")}</h2>
              {pendingPayouts.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">{t("noPendingPayouts")}</p></GlassPanel>
              )}
              {pendingPayouts.map((p) => (
                <GlassPanel key={p.id} className={`p-4 mb-3 ${p.dueSoon ? "border-secondary/50 shadow-[0_0_15px_rgba(233,195,73,0.2)]" : ""}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{p.fullName} <span className="text-xs font-normal text-on-surface-variant">@{p.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{t("monthYear")}: {p.month}/{p.year}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{fmtPKR(p.amount)}</p>
                      <p className="text-xs text-on-surface-variant">{t("payoutDate")}: {fmtDate(p.payout_date)}</p>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex rounded-full bg-secondary/15 px-3 py-1 font-semibold text-secondary border border-secondary/30">{p.status}</span>
                    {p.dueSoon && (
                      <span className="inline-flex rounded-full bg-error/15 px-3 py-1 font-semibold text-error border border-error/30 animate-pulse-glow">
                        {t("dueSoon")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => handlePayout(p, "payout")} className="btn-3d-lime h-9 rounded-lg px-4 text-sm font-bold">
                      <Check className="w-4 h-4 mr-1 inline" /> {t("payoutSent")}
                    </button>
                    {p.dueSoon && (
                      <button onClick={() => handlePayout(p, "remind")} className="h-9 rounded-lg bg-secondary/10 px-4 text-sm font-semibold text-secondary border border-secondary/30 hover:bg-secondary/20">
                        <Bell className="w-4 h-4 mr-1 inline" /> {t("dueSoon")}
                      </button>
                    )}
                  </div>
                </GlassPanel>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("allPayouts")}</h2>
              <GlassPanel className="overflow-x-auto p-4">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t("name")}</th>
                      <th className="px-3 py-2">{t("deposited")}</th>
                      <th className="px-3 py-2">{t("monthYear")}</th>
                      <th className="px-3 py-2">{t("status")}</th>
                      <th className="px-3 py-2">{t("payoutDate")}</th>
                      <th className="px-3 py-2">{t("receipt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2"><p className="font-medium">{p.fullName}</p><p className="text-xs text-on-surface-variant">@{p.username}</p></td>
                        <td className="px-3 py-2 text-primary">{fmtPKR(p.amount)}</td>
                        <td className="px-3 py-2">{p.month}/{p.year}</td>
                        <td className="px-3 py-2"><span className={statusBadgeCls(p.status)}>{p.status}</span></td>
                        <td className="px-3 py-2">{fmtDate(p.payout_date)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => openReceiptModal("payout", p.id)}
                            className="btn-3d-lime h-8 rounded-lg px-3 text-xs font-bold whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3 mr-1 inline" />
                            {t("generateReceipt")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            </div>
          </div>
        ) : tab === "returns" ? (
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">{t("investmentReturns")}</h2>
              {pendingReturns.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">{t("noReturnRequests")}</p></GlassPanel>
              )}
              {pendingReturns.map((r) => (
                <GlassPanel key={r.id} className="p-4 mb-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{r.fullName} <span className="text-xs font-normal text-on-surface-variant">@{r.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{r.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{fmtPKR(Number(r.amount ?? 0))}</p>
                      <p className="text-xs text-on-surface-variant">{t("requestedDate")}: {fmtDate(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => handleReturn(r, "approve")} className="btn-3d-lime h-9 rounded-lg px-4 text-sm font-bold">
                      <Check className="w-4 h-4 mr-1 inline" /> {t("approve")}
                    </button>
                    <button onClick={() => handleReturn(r, "reject")} className="btn-danger-3d h-9 rounded-lg px-4 text-sm font-semibold">
                      <X className="w-4 h-4 mr-1 inline" /> {t("reject")}
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>

            {/* Approved returns awaiting manual external payout */}
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">Approved — awaiting return (hold active)</h2>
              {approvedReturns.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">No approved returns awaiting payout.</p></GlassPanel>
              )}
              {approvedReturns.map((r) => (
                <GlassPanel key={r.id} className="p-4 mb-3 border-secondary/50">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{r.fullName} <span className="text-xs font-normal text-on-surface-variant">@{r.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{r.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{fmtPKR(Number(r.amount ?? 0))}</p>
                      <p className="text-xs text-on-surface-variant">Approved: {fmtDate(r.approved_at)}</p>
                      <p className="text-xs text-on-surface-variant">Expected return: {fmtDate(r.expected_return_date)}</p>
                    </div>
                  </div>
                  <p className="mb-3 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    Send the money manually through your external application first, then mark it as returned here.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => handleReturn(r, "mark_completed")} className="btn-3d-lime h-9 rounded-lg px-4 text-sm font-bold">
                      <Check className="w-4 h-4 mr-1 inline" /> Mark Investment Returned
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("allReturns")}</h2>
              <GlassPanel className="overflow-x-auto p-4">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t("name")}</th>
                      <th className="px-3 py-2">{t("mobile")}</th>
                      <th className="px-3 py-2">{t("deposited")}</th>
                      <th className="px-3 py-2">{t("status")}</th>
                      <th className="px-3 py-2">{t("requestedDate")}</th>
                      <th className="px-3 py-2">Expected</th>
                      <th className="px-3 py-2">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((r) => (
                      <tr key={r.id} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2"><p className="font-medium">{r.fullName}</p><p className="text-xs text-on-surface-variant">@{r.username}</p></td>
                        <td className="px-3 py-2">{r.mobile}</td>
                        <td className="px-3 py-2 text-primary">{fmtPKR(Number(r.amount ?? 0))}</td>
                        <td className="px-3 py-2"><span className={statusBadgeCls(r.status)}>{r.status}</span></td>
                        <td className="px-3 py-2">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2">{fmtDate(r.expected_return_date)}</td>
                        <td className="px-3 py-2">{fmtDate(r.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            </div>
          </div>
        ) : tab === "upgrades" ? (
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 text-lg font-bold text-secondary">Pending Investment Upgrades</h2>
              {pendingUpgrades.length === 0 && (
                <GlassPanel className="p-6"><p className="text-sm text-on-surface-variant">No pending upgrade requests.</p></GlassPanel>
              )}
              {pendingUpgrades.map((u) => (
                <GlassPanel key={u.id} className="p-4 mb-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-on-surface">{u.fullName} <span className="text-xs font-normal text-on-surface-variant">@{u.username}</span></p>
                      <p className="text-xs text-on-surface-variant">{u.mobile}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>Previous: <b>{fmtPKR(u.previous_amount)}</b></p>
                      <p>New: <b>{fmtPKR(u.requested_amount)}</b></p>
                      <p>Increase: <b className="text-primary">{fmtPKR(u.increase_amount)}</b></p>
                    </div>
                  </div>
                  <p className="mb-3 rounded bg-[#0B2E1F]/5 px-3 py-2 text-xs text-on-surface-variant">
                    This upgrade becomes effective automatically after the member's next completed withdrawal or paid profit.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => handleUpgradeReject(u)} className="btn-danger-3d h-9 rounded-lg px-4 text-sm font-semibold">
                      <X className="w-4 h-4 mr-1 inline" /> Reject Upgrade
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">All Upgrades</h2>
              <GlassPanel className="overflow-x-auto p-4">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <th className="px-3 py-2">{t("name")}</th>
                      <th className="px-3 py-2">Previous</th>
                      <th className="px-3 py-2">New</th>
                      <th className="px-3 py-2">Increase</th>
                      <th className="px-3 py-2">{t("status")}</th>
                      <th className="px-3 py-2">{t("requestedDate")}</th>
                      <th className="px-3 py-2">Activated</th>
                      <th className="px-3 py-2">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upgrades.map((u) => (
                      <tr key={u.id} className="border-b border-outline-variant/10">
                        <td className="px-3 py-2"><p className="font-medium">{u.fullName}</p><p className="text-xs text-on-surface-variant">@{u.username}</p></td>
                        <td className="px-3 py-2">{fmtPKR(u.previous_amount)}</td>
                        <td className="px-3 py-2">{fmtPKR(u.requested_amount)}</td>
                        <td className="px-3 py-2 text-primary">{fmtPKR(u.increase_amount)}</td>
                        <td className="px-3 py-2"><span className={statusBadgeCls(u.status === "active" ? "approved" : u.status === "rejected" || u.status === "cancelled" ? "rejected" : "pending")}>{u.status}</span></td>
                        <td className="px-3 py-2">{fmtDate(u.requested_at)}</td>
                        <td className="px-3 py-2">{fmtDate(u.activated_at)}</td>
                        <td className="px-3 py-2">{u.activated_after_entity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            </div>
          </div>
        ) : tab === "notifications" ? (
          <div className="space-y-6">
            <GlassPanel className="p-6">
              <h2 className="text-title-md text-on-surface mb-4">{t("notificationComposer")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("titleEn")}</label>
                  <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("titleUr")}</label>
                  <input value={notifTitleUr} onChange={(e) => setNotifTitleUr(e.target.value)} dir="rtl" className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("messageEn")}</label>
                  <textarea value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} rows={3} className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-label-md text-on-surface-variant">{t("messageUr")}</label>
                  <textarea value={notifMessageUr} onChange={(e) => setNotifMessageUr(e.target.value)} rows={3} dir="rtl" className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="text-label-md text-on-surface-variant">{t("targetAudience")}:</label>
                <select
                  value={notifAll ? "all" : "specific"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNotifAll(v === "all");
                    if (v === "all") setNotifUserId("");
                  }}
                  className="h-9 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="all">{t("allUsers")}</option>
                  <option value="specific">{t("specificUser")}</option>
                </select>
                {!notifAll && (
                  <select
                    value={notifUserId}
                    onChange={(e) => setNotifUserId(e.target.value)}
                    className="h-9 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary"
                  >
                    <option value="">{t("selectUser")}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button onClick={sendNotification} className="btn-3d-lime h-10 rounded-lg px-6 text-sm font-bold mt-4">
                <Bell className="w-4 h-4 mr-1 inline" /> {t("sendNotification")}
              </button>
            </GlassPanel>

            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">{t("notificationLog")}</h2>
              {notifications.length === 0 ? (
                <GlassPanel className="p-6">
                  <p className="text-sm text-on-surface-variant">{t("noNotificationsSent")}</p>
                </GlassPanel>
              ) : (
                <GlassPanel className="overflow-x-auto p-4">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                        <th className="px-3 py-2">{t("titleEn")}</th>
                        <th className="px-3 py-2">{t("messageEn")}</th>
                        <th className="px-3 py-2">{t("sentTo")}</th>
                        <th className="px-3 py-2">{t("registered")}</th>
                        <th className="px-3 py-2">{t("readBy")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notifications.map((n) => (
                        <tr key={n.id} className="border-b border-outline-variant/10">
                          <td className="px-3 py-2 font-medium">{n.title}</td>
                          <td className="px-3 py-2">{n.message}</td>
                          <td className="px-3 py-2">
                            {n.target === "specific" ? (
                              <span className="inline-flex rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary border border-secondary/30">
                                {t("specificUser")}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary border border-primary/30">
                                {t("allUsers")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{fmtDate(n.created_at)}</td>
                          <td className="px-3 py-2">
                            {n.read_count}/{n.total_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GlassPanel>
              )}
            </div>
          </div>
        ) : tab === "chat" ? (
          <div className="grid gap-6 md:grid-cols-2">
            <GlassPanel className="p-4">
              <h2 className="text-title-md text-on-surface mb-4">{t("chatUsers")}</h2>
              {chatUsers.length === 0 && (
                <p className="text-sm text-on-surface-variant">{t("noChatUsers")}</p>
              )}
              <div className="space-y-2">
                {chatUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => loadChatThread(u.id)}
                    className={`w-full text-left rounded-lg p-3 border transition-colors ${
                      selectedChatUser === u.id
                        ? "bg-surface-container-high border-primary/50"
                        : "bg-surface-container-low border-outline-variant/30 hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-on-surface">{u.fullName} <span className="text-xs text-on-surface-variant">@{u.username}</span></p>
                      {u.unread > 0 && (
                        <span className="inline-flex rounded-full bg-error/20 px-2 py-0.5 text-xs font-semibold text-error">
                          {u.unread} {t("unread")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1 truncate">{u.lastMessage}</p>
                  </button>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="p-4 flex flex-col">
              <h2 className="text-title-md text-on-surface mb-4">{t("chat")}</h2>
              {!selectedChatUser ? (
                <p className="text-sm text-on-surface-variant">{t("selectUser")}</p>
              ) : (
                <>
                  <div className="flex-1 max-h-[50vh] overflow-y-auto custom-scrollbar space-y-2 mb-4">
                    {chatThread.map((m) => (
                      <div key={m.id} className="flex flex-col">
                        <span className="mb-1 text-xs font-semibold text-on-surface-variant">
                          {m.sender === "user" ? "User" : m.sender === "admin" ? "Admin" : m.sender === "ai" ? "AI" : "System"}
                        </span>
                        <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                          m.sender === "user"
                            ? "bg-primary-container text-on-primary-container"
                            : m.sender === "admin"
                            ? "bg-secondary text-on-secondary"
                            : "bg-surface-container-high text-on-surface"
                        }`}>
                          {m.message}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={chatReply}
                      onChange={(e) => setChatReply(e.target.value)}
                      placeholder={t("replyAsAdmin")}
                      className="h-11 flex-1 rounded-xl border border-outline-variant/50 bg-surface-container-low px-4 text-sm text-on-surface outline-none focus:border-primary"
                    />
                    <button onClick={sendAdminReply} className="btn-3d-lime h-11 rounded-xl px-4 text-sm font-bold">
                      <Send className="w-4 h-4" /> {t("send")}
                    </button>
                  </div>
                </>
              )}
            </GlassPanel>
          </div>
        ) : null}
      </div>

      {/* Receipt generation modal */}
      {receiptTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm overflow-y-auto p-6"
          onClick={() => setReceiptTarget(null)}
        >
          <div
            className="glass-panel p-6 max-w-xl w-full my-8 mx-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-on-surface">
                {receiptTarget.type === "deposit" ? t("depositReceipt") : t("payoutReceipt")}
              </h2>
              <button
                onClick={() => setReceiptTarget(null)}
                className="h-9 rounded-lg px-3 text-sm font-semibold bg-surface-bright hover:bg-surface-container-high"
              >
                <X className="w-4 h-4 inline" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant mr-1">
                {t("receiptLanguage")}:
              </span>
              {([
                ["en", "english"],
                ["ur", "urdu"],
              ] as const).map(([code, key]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setReceiptLang(code);
                    setReceiptData(null);
                    setReceiptMsg(null);
                  }}
                  className={`h-9 rounded-lg px-4 text-sm font-semibold border transition-colors ${
                    receiptLang === code
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-surface-bright text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high"
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            <button
              onClick={generateReceipt}
              disabled={receiptBusy}
              className="btn-3d-lime h-10 rounded-lg px-5 text-sm font-bold disabled:opacity-50"
            >
              {receiptBusy ? t("processing") : t("generateReceipt")}
            </button>

            {receiptMsg && (
              <p className={`text-sm ${receiptMsg === t("receiptGenerated") ? "text-primary" : "text-error"}`}>
                {receiptMsg}
              </p>
            )}

            {receiptData && (
              <div className="pt-2 border-t border-outline-variant/30">
                <ReceiptGenerator data={receiptData} />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function HealthMetric({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: "lime" | "gold" | "mint";
}) {
  const barColor =
    color === "lime"
      ? "bg-gradient-to-r from-primary-fixed-dim to-primary drop-shadow-[0_0_5px_rgba(208,255,130,0.5)]"
      : color === "gold"
      ? "bg-gradient-to-r from-secondary-fixed-dim to-secondary-fixed drop-shadow-[0_0_5px_rgba(233,195,73,0.5)]"
      : "bg-gradient-to-r from-tertiary-fixed-dim to-tertiary drop-shadow-[0_0_5px_rgba(210,249,225,0.5)]";
  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-label-md text-on-surface-variant">{label}</span>
        <span className="text-body-md text-on-surface">{value}</span>
      </div>
      <div className="w-full h-3 bg-surface-container-low rounded-full overflow-hidden shadow-inner">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

function statusBadgeCls(status: string) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold border";
  switch (status) {
    case "approved":
    case "completed":
    case "paid":
      return `${base} bg-primary/15 text-primary border-primary/30`;
    case "rejected":
      return `${base} bg-error/15 text-error border-error/30`;
    default:
      return `${base} bg-secondary/15 text-secondary border-secondary/30`;
  }
}