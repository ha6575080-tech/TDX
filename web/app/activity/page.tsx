"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  RotateCcw,
  TrendingUp,
  Inbox,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { extractErrorInfo } from "@/lib/errors";

/**
 * Activity — unified transaction history with per-transaction receipts.
 * All amounts/statuses come from /api/transactions (authoritative,
 * session-scoped). The browser never computes a financial value.
 * Receipts print via the browser (window.print) — no PDF server.
 */

type TxType = "deposit" | "withdrawal" | "payout" | "return" | "upgrade";

interface Tx {
  id: string;
  type: TxType;
  amount: number;
  status: string;
  date: string;
  meta: Record<string, string | number | null>;
}

const TYPE_META: Record<TxType, { en: string; ur: string; icon: React.ReactNode }> = {
  deposit: { en: "Deposit", ur: "ڈپازٹ", icon: <ArrowDownToLine className="w-4 h-4" /> },
  withdrawal: { en: "Withdrawal", ur: "واپسی", icon: <ArrowUpFromLine className="w-4 h-4" /> },
  payout: { en: "Profit payout", ur: "منافع", icon: <Coins className="w-4 h-4" /> },
  return: { en: "Investment return", ur: "سرمایہ واپسی", icon: <RotateCcw className="w-4 h-4" /> },
  upgrade: { en: "Investment upgrade", ur: "سرمایہ اضافہ", icon: <TrendingUp className="w-4 h-4" /> },
};

function statusStyle(status: string): string {
  // Status is conveyed by text label + border, never color alone.
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold border";
  switch (status) {
    case "approved":
    case "paid":
    case "completed":
    case "active":
      return `${base} bg-primary/15 text-primary border-primary/30`;
    case "rejected":
    case "cancelled":
    case "failed":
      return `${base} bg-error/15 text-error border-error/30`;
    case "pending":
    case "requested":
      return `${base} bg-secondary/15 text-secondary border-secondary/30`;
    default:
      return `${base} bg-surface-container-high text-on-surface-variant border-outline-variant/30`;
  }
}

function fmtPKR(n: number): string {
  return `${(n ?? 0).toLocaleString("en-PK")} PKR`;
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function metaLabel(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ActivityPage() {
  const { lang } = useI18n();
  const isUr = lang === "ur";
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/transactions");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const info = extractErrorInfo(data?.error ?? null, "Could not load your transactions.");
        setError(info.friendly);
        setTxs([]);
        return;
      }
      setTxs(data.transactions ?? []);
    } catch {
      setError(isUr ? "نیٹ ورک کا مسئلہ۔ دوبارہ کوشش کریں۔" : "A network problem occurred. Please try again.");
      setTxs([]);
    }
  }, [isUr]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen bg-base text-on-surface pb-28 md:pb-10">
      <TopNav active="/activity" />

      <div className="max-w-3xl mx-auto px-4 pt-20 md:pt-24">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-headline-md font-bold text-primary tracking-tight">
            {isUr ? "سرگرمی" : "Activity"}
          </h1>
          <PrintButton />
        </div>
        <p className="text-label-sm text-on-surface-variant mb-6">
          {isUr
            ? "آپ کے تمام لین دین کی سرکاری تفصیلات۔ رسید دیکھنے اور پرنٹ کرنے کے لیے کسی آئٹم کو کھولیں۔"
            : "Authoritative details for all your transactions. Open an item to view and print its receipt."}
        </p>

        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error mb-4" role="alert">
            {error}
          </div>
        )}

        {txs === null && (
          <div className="space-y-3" role="status" aria-label={isUr ? "لوڈ ہو رہا ہے" : "Loading"}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-surface-container-low animate-pulse" />
            ))}
          </div>
        )}

        {txs !== null && txs.length === 0 && !error && (
          <GlassPanel className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-on-surface-variant/50 mb-3" />
            <p className="text-sm text-on-surface-variant">
              {isUr ? "ابھی کوئی لین دین نہیں۔" : "No transactions yet."}
            </p>
          </GlassPanel>
        )}

        {txs !== null && txs.length > 0 && (
          <ul className="space-y-3">
            {txs.map((tx) => {
              const tm = TYPE_META[tx.type];
              const open = openId === tx.id;
              return (
                <li key={`${tx.type}-${tx.id}`}>
                  <GlassPanel className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : tx.id)}
                      aria-expanded={open}
                      aria-label={`${isUr ? tm.ur : tm.en}, ${fmtPKR(tx.amount)}, ${tx.status}`}
                      className="w-full text-left p-4 flex items-center gap-3 hover:bg-surface-bright/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span className="w-9 h-9 rounded-full bg-surface-bright flex items-center justify-center shrink-0 text-primary">
                        {tm.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-on-surface">
                          {isUr ? tm.ur : tm.en}
                        </span>
                        <span className="block text-xs text-on-surface-variant">
                          {fmtDateTime(tx.date)} · #{tx.id.slice(0, 8)}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-bold text-on-surface">{fmtPKR(tx.amount)}</span>
                        <span className={statusStyle(tx.status)}>{tx.status}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-outline-variant/20 p-4 bg-surface-container-low/60">
                        {/* Receipt card — authoritative data only */}
                        <div className="rounded-xl border border-outline-variant/30 bg-surface p-4 max-w-sm mx-auto">
                          <div className="text-center mb-3">
                            <p className="text-lg font-bold text-primary tracking-tighter">TDX</p>
                            <p className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                              {isUr ? "رسید" : "Transaction receipt"}
                            </p>
                          </div>
                          <dl className="space-y-1.5 text-xs">
                            <div className="flex justify-between gap-3">
                              <dt className="text-on-surface-variant">{isUr ? "حوالہ" : "Reference"}</dt>
                              <dd className="font-mono text-on-surface break-all text-right">{tx.id}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-on-surface-variant">{isUr ? "قسم" : "Type"}</dt>
                              <dd className="text-on-surface font-semibold">{isUr ? tm.ur : tm.en}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-on-surface-variant">{isUr ? "رقم" : "Amount"}</dt>
                              <dd className="text-on-surface font-bold">{fmtPKR(tx.amount)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-on-surface-variant">{isUr ? "حالت" : "Status"}</dt>
                              <dd><span className={statusStyle(tx.status)}>{tx.status}</span></dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-on-surface-variant">{isUr ? "تاریخ" : "Date"}</dt>
                              <dd className="text-on-surface">{fmtDateTime(tx.date)}</dd>
                            </div>
                            {Object.entries(tx.meta)
                              .filter(([, v]) => v !== null && v !== "")
                              .map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-3">
                                  <dt className="text-on-surface-variant">{metaLabel(k)}</dt>
                                  <dd className="text-on-surface text-right">
                                    {typeof v === "number" ? v.toLocaleString() : String(v)}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                          <p className="text-[10px] text-on-surface-variant/70 text-center mt-3">
                            {isUr ? "یہ سسٹم سے تیار کردہ رسید ہے۔" : "This is a system-generated receipt."}
                          </p>
                        </div>
                        <div className="flex justify-center mt-3 print:hidden">
                          <PrintButton />
                        </div>
                      </div>
                    )}
                  </GlassPanel>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomNav active="/activity" />
    </main>
  );
}

