"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import ReceiptGenerator, { type ReceiptData } from "@/components/ReceiptGenerator";

interface PickRow {
  id: string;
  label: string;
}

export default function AdminReceiptsPage() {
  const { t, lang } = useI18n();
  const [type, setType] = useState<"deposit" | "payout">("deposit");
  const [rows, setRows] = useState<PickRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const loadRecords = useCallback(async (tp: "deposit" | "payout") => {
    setLoading(true);
    setErr(null);
    setSelectedId("");
    setReceipt(null);
    try {
      const endpoint = tp === "deposit" ? "/api/admin/deposits" : "/api/admin/payouts";
      const r = await fetch(endpoint);
      const json = await r.json();
      if (!r.ok) {
        setErr(json.error || t("forbidden"));
        setRows([]);
        return;
      }
      const list: unknown[] = tp === "deposit" ? (json.deposits ?? []) : (json.payouts ?? []);
      const mapped: PickRow[] = (list as Array<Record<string, unknown>>).map((x) => ({
        id: String(x.id),
        label:
          `${String(x.fullName ?? x.user ?? "?")} · Rs ${Number(x.amount ?? 0).toLocaleString()}` +
          (tp === "payout" && x.month ? ` · ${String(x.month)}/${String(x.year)}` : "") +
          ` · ${String(x.status ?? "")}`,
      }));
      setRows(mapped);
    } catch {
      setErr(t("forbidden"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadRecords(type);
  }, [type, loadRecords]);

  const generate = async () => {
    if (!selectedId) return;
    setLoading(true);
    setErr(null);
    setReceipt(null);
    try {
      const r = await fetch("/api/admin/receipt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: selectedId, language: lang }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setErr(json.error || t("forbidden"));
      } else {
        setReceipt(json.receipt as ReceiptData);
      }
    } catch {
      setErr(t("forbidden"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl" dir={lang === "ur" ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">{t("adminReceipts")}</h1>

      <div className="glass-panel p-6 space-y-4">
        {/* Type selector */}
        <div className="flex gap-3">
          {(["deposit", "payout"] as const).map((tp) => (
            <button
              key={tp}
              onClick={() => setType(tp)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border ${
                type === tp
                  ? "bg-lime-400/20 text-lime-300 border-lime-400/40"
                  : "bg-transparent text-white/60 border-white/10"
              }`}
            >
              {tp === "deposit" ? t("deposit") : t("payout")}
            </button>
          ))}
        </div>

        {/* Record picker */}
        <label className="block">
          <span className="text-white/50 text-xs block mb-1">{t("selectRecord")}</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading || rows.length === 0}
            className="w-full glass-panel px-3 py-2 text-sm bg-transparent border border-white/10 rounded-lg"
          >
            <option value="">{loading ? t("loading") : t("selectRecord")}</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>

        {err && <p className="text-sm text-red-400">{err}</p>}
        {!err && !loading && rows.length === 0 && (
          <p className="text-sm text-white/50">{t("noDataForPeriod")}</p>
        )}

        <button
          onClick={generate}
          disabled={!selectedId || loading}
          className="btn-3d-lime px-6 py-2 rounded-xl disabled:opacity-50"
        >
          {loading ? t("processing") : t("generateReceipt")}
        </button>
      </div>

      {receipt && <ReceiptGenerator data={receipt} />}
    </div>
  );
}
