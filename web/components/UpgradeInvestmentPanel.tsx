"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";

export interface PendingUpgradeState {
  id: string;
  previous_amount: number;
  requested_amount: number;
  increase_amount: number;
  status: string;
  requested_at: string;
}

function fmtPKR(n: number): string {
  return `${(n ?? 0).toLocaleString("en-PK")} PKR`;
}

interface Props {
  currentInvestment: number;
  pendingUpgrade: PendingUpgradeState | null;
  onUpgradeSubmitted: () => void;
}

/**
 * Member dashboard panel for the INVESTMENT UPGRADE workflow.
 * The member only proposes a new amount; the server validates it against
 * the authoritative current investment. The upgrade is PENDING and becomes
 * effective only after the next payout/withdrawal.
 */
export default function UpgradeInvestmentPanel({
  currentInvestment,
  pendingUpgrade,
  onUpgradeSubmitted,
}: Props) {
  const [newAmount, setNewAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const parsed = Number(newAmount);
  const increase = useMemo(
    () => (Number.isFinite(parsed) && parsed > 0 ? parsed - currentInvestment : null),
    [parsed, currentInvestment]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmation(null);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/upgrades/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAmount: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upgrade request failed.");
      setConfirmation(
        `Your investment upgrade request has been received. Your new investment amount (${fmtPKR(
          data.requestedAmount
        )}) will be counted after your next payout/withdrawal.`
      );
      setNewAmount("");
      onUpgradeSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <TrendingUp className="h-5 w-5" />
        Upgrade Investment
      </h2>

      {/* Pending upgrade summary */}
      {pendingUpgrade && (
        <div className="mb-4 rounded-lg border border-[#2B2B2B]/10 bg-white p-4 text-sm">
          <p className="font-bold">Pending upgrade</p>
          <p className="mt-1">
            Previous Investment: {fmtPKR(pendingUpgrade.previous_amount)}
          </p>
          <p>New Investment: {fmtPKR(pendingUpgrade.requested_amount)}</p>
          <p>Increase: {fmtPKR(pendingUpgrade.increase_amount)}</p>
          <p className="mt-2 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Your upgraded investment will be counted after your next
            payout/withdrawal.
          </p>
        </div>
      )}

      {!pendingUpgrade && (
        <>
          <p className="mb-4 rounded-lg bg-[#0B2E1F]/5 px-4 py-2 text-sm">
            Current investment:{" "}
            <span className="font-bold">{fmtPKR(currentInvestment)}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold">
                New Investment Amount (PKR)
              </label>
              <input
                type="number"
                min="1"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder={`Must be greater than ${currentInvestment}`}
                className="w-full rounded-lg border border-[#2B2B2B]/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4C6B2A]"
              />
            </div>

            {/* Live calculation (display only — server re-validates) */}
            {increase !== null && (
              <div className="rounded-lg border border-[#2B2B2B]/10 bg-white p-4 text-sm">
                <p>
                  Previous Investment:{" "}
                  <span className="font-semibold">{fmtPKR(currentInvestment)}</span>
                </p>
                <p>
                  New Investment:{" "}
                  <span className="font-semibold">{fmtPKR(parsed)}</span>
                </p>
                <p>
                  Increase:{" "}
                  <span
                    className={
                      increase > 0
                        ? "font-bold text-green-700"
                        : "font-bold text-red-700"
                    }
                  >
                    {fmtPKR(increase)}
                  </span>
                </p>
                {increase > 0 && (
                  <p className="mt-2 text-xs text-[#2B2B2B]/70">
                    Your upgraded investment will be counted after your next
                    payout/withdrawal. Your current cycle continues using{" "}
                    {fmtPKR(currentInvestment)}.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {confirmation && (
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
                {confirmation}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !Number.isFinite(parsed) || parsed <= 0}
              className="h-11 w-full rounded-lg bg-[#A8E636] text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Request Upgrade"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}