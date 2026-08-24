"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WITHDRAWAL_FEE_PKR } from "@/lib/investment";

interface Withdrawal {
  id: string;
  amount: number | null;
  fee: number | null;
  net_amount: number | null;
  status: string;
  requested_at: string;
}

// Server-authoritative cycle state (mirrors withdrawal_current_cycle()).
interface CycleState {
  cycleNumber: number | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  // The moment the withdraw button becomes actionable: cycle_end - 24h.
  actionableAt: string | null;
  actionableNow: boolean;
}

function statusBadge(status: string) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold";
  switch (status) {
    case "approved":
      return `${base} bg-green-100 text-green-800`;
    case "completed":
      return `${base} bg-blue-100 text-blue-800`;
    case "rejected":
      return `${base} bg-red-100 text-red-700`;
    case "pending":
    default:
      return `${base} bg-yellow-100 text-yellow-800`;
  }
}

export default function WithdrawForm() {
  const supabase = createClient();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Server-computed authoritative values (display only — the server
  // re-validates everything on submit).
  const [activeInvestment, setActiveInvestment] = useState<number | null>(null);
  const [cycle, setCycle] = useState<CycleState | null>(null);

  const loadWithdrawals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("withdrawals")
      .select(
        "id, amount, fee, net_amount, status, requested_at"
      )
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(10);

    setWithdrawals((data ?? []) as Withdrawal[]);

    // Fetch the authoritative investment + cycle state for display.
    try {
      const res = await fetch("/api/account/summary");
      if (res.ok) {
        const summary = await res.json();
        setActiveInvestment(summary.authoritative?.activeInvestment ?? 0);
        setCycle(summary.financial?.cycle ?? null);
      }
    } catch {
      // non-fatal: the server still validates on submit
    }
  }, [supabase]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated.");
      return;
    }

    setLoading(true);
    try {
      // NO amount is sent — the server determines the eligible principal,
      // cycle, and financial amounts authoritatively.
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed.");

      setSuccess(
        data.withdrawal?.cycle_number != null
          ? `Monthly profit withdrawal request submitted for cycle #${data.withdrawal.cycle_number}.`
          : "Withdrawal request submitted successfully!"
      );
      await loadWithdrawals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setLoading(false);
    }
  }, [loadWithdrawals, supabase]);

  const actionableNow = !!cycle?.actionableNow;

  return (
    <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
      <h2 className="mb-4 text-lg font-bold">Withdraw Funds</h2>

      {activeInvestment !== null && activeInvestment > 0 && (
        <p className="mb-4 rounded-lg bg-[#0B2E1F]/5 px-4 py-2 text-sm text-[#2B2B2B]">
          Active investment:{" "}
          <span className="font-bold">
            {activeInvestment.toLocaleString("en-PK")} PKR
          </span>{" "}
          · Monthly profit 7%–10% (selected by Super Admin at completion) · Fee{" "}
          {WITHDRAWAL_FEE_PKR} PKR
        </p>
      )}

      {/* Pre-submit cycle eligibility indicator (display only — the RPC
          re-validates authoritatively on submit). */}
      {cycle?.actionableAt && !actionableNow && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Withdrawal available on{" "}
          <span className="font-bold">
            {new Date(cycle.actionableAt).toLocaleDateString("en-PK", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          .
        </div>
      )}
      {actionableNow && cycle?.cycleEnd && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your 30-day cycle is complete or completing within 24 hours — you can
          request your monthly profit withdrawal now.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* NO withdrawal amount input exists by design: the server calculates
          the eligible profit from the authoritative principal and the
          admin-selected monthly rate. */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !actionableNow}
        title={
          !actionableNow
            ? "Your 30-day cycle is not complete yet."
            : undefined
        }
        className="h-11 w-full rounded-lg bg-[#A8E636] text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Processing..." : "Withdraw"}
      </button>

      <p className="mt-4 rounded-lg bg-[#0B2E1F]/5 px-4 py-3 text-xs leading-relaxed text-[#2B2B2B]/70">
        Your monthly profit will be transferred into your account within 24-48
        hours of completion. Please note: {WITHDRAWAL_FEE_PKR} rupees will be
        charged per withdrawal. One withdrawal per 30-day cycle is allowed.
      </p>

      {withdrawals.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-base font-bold">Withdrawal History</h3>
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-[#2B2B2B]/10 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {w.amount != null ? `${w.amount} PKR` : "Pending rate"}
                  </p>
                  <p className="text-xs text-[#2B2B2B]/50">
                    {new Date(w.requested_at).toLocaleDateString("en-PK")}
                    {w.net_amount != null ? ` · Net ${w.net_amount} PKR` : ""}
                  </p>
                </div>
                <span className={statusBadge(w.status)}>{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}