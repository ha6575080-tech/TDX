"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

export interface ReturnRequestState {
  id: string;
  amount: number | null;
  returned_amount: number | null;
  status: string;
  requested_at: string;
  approved_at: string | null;
  expected_return_date: string | null;
  completed_at: string | null;
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

interface Props {
  returnRequest: ReturnRequestState | null;
  hasInvestment: boolean;
  onRequestSubmitted: () => void;
}

/**
 * Member dashboard panel for the RETURN INVESTMENT workflow.
 * The amount is never entered by the member — it is derived server-side.
 */
export default function ReturnInvestmentPanel({
  returnRequest,
  hasInvestment,
  onRequestSubmitted,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const unresolved =
    !!returnRequest && ["requested", "approved"].includes(returnRequest.status);

  async function handleRequest() {
    setError(null);
    setConfirmation(null);
    setLoading(true);
    try {
      const res = await fetch("/api/returns/request", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setConfirmation(
        `Your return investment request for ${fmtPKR(
          data.amount ?? 0
        )} has been received and sent to the Super Admin for review.`
      );
      onRequestSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const holdActive = returnRequest?.status === "approved";

  return (
    <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <ShieldAlert className="h-5 w-5" />
        Return Investment
      </h2>

      {/* HOLD banner while approved / processing */}
      {holdActive && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-bold">Financial activities on hold</p>
          <p className="mt-1">
            Your withdrawal, profit, and payout activities have been placed on
            hold until your investment is returned.
          </p>
        </div>
      )}

      {!unresolved && (
        <>
          <p className="mb-3 rounded-lg bg-[#0B2E1F]/5 px-4 py-2 text-sm">
            Request the Super Admin to return your original invested principal.
            This is separate from a normal profit withdrawal.
          </p>
          {!hasInvestment && (
            <p className="mb-3 rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              You need an approved investment before requesting a return.
            </p>
          )}
          <button
            type="button"
            onClick={handleRequest}
            disabled={loading || !hasInvestment}
            className="h-11 w-full rounded-lg bg-[#D4AF37] px-6 text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#e0c04a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Return Investment"}
          </button>
        </>
      )}

      {returnRequest && (
        <div className="mt-4 space-y-2 rounded-lg border border-[#2B2B2B]/10 bg-white p-4 text-sm">
          <p>
            <span className="font-semibold">Status:</span>{" "}
            <span className="uppercase">{returnRequest.status}</span>
          </p>
          <p>
            <span className="font-semibold">Amount:</span>{" "}
            {fmtPKR(Number(returnRequest.amount ?? 0))}
          </p>
          <p>
            <span className="font-semibold">Requested:</span>{" "}
            {fmtDate(returnRequest.requested_at)}
          </p>
          {returnRequest.approved_at && (
            <p>
              <span className="font-semibold">Approved:</span>{" "}
              {fmtDate(returnRequest.approved_at)}
            </p>
          )}
          {returnRequest.expected_return_date && (
            <p>
              <span className="font-semibold">Expected return date:</span>{" "}
              {fmtDate(returnRequest.expected_return_date)}
            </p>
          )}
          {returnRequest.completed_at && (
            <p>
              <span className="font-semibold">Returned:</span>{" "}
              {fmtDate(returnRequest.completed_at)} ·{" "}
              {fmtPKR(Number(returnRequest.returned_amount ?? 0))}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {confirmation}
        </div>
      )}
    </div>
  );
}