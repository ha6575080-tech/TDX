"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MIN_INVESTMENT_PKR,
  MAX_INVESTMENT_PKR,
  PAYMENT_ACCOUNT,
} from "@/lib/investment";

// Matches the storage-layer limit enforced by the P0 hardening migration.
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

export default function DepositForm() {
  const router = useRouter();
  const supabase = createClient();

  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const amountNum = Number(amount);
  // Fixed product range: PKR 5,000 – 2,000,000. No package selection.
  const amountValid =
    !isNaN(amountNum) &&
    Number.isFinite(amountNum) &&
    amountNum >= MIN_INVESTMENT_PKR &&
    amountNum <= MAX_INVESTMENT_PKR;

  const canSubmit = amountValid && receipt !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canSubmit) {
      setError(
        `Please enter an investment amount between ${MIN_INVESTMENT_PKR.toLocaleString()} and ${MAX_INVESTMENT_PKR.toLocaleString()} PKR and upload a receipt screenshot.`
      );
      return;
    }

    if (receipt!.size > MAX_RECEIPT_BYTES) {
      setError("Receipt image is too large — please upload an image under 5 MB.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be logged in.");
      }

      const userId = user.id;

      // 1. Upload receipt to receipts bucket at <user_id>/<filename>.
      const receiptPath = `${userId}/${receipt!.name}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(receiptPath, receipt!, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Create the deposit record (status 'pending'). No package is
      //    selected anymore — package_id stays NULL for new deposits;
      //    historical package records are untouched.
      const { data: deposit, error: depositError } = await supabase
        .from("deposits")
        .insert({
          user_id: userId,
          amount: amountNum,
          receipt_image_url: receiptPath,
          status: "pending",
        })
        .select("id")
        .single();

      if (depositError) throw depositError;

      // 3. Call the server route for AI verification + admin email.
      // The session is the identity — no client userId is sent.
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: deposit.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to process deposit.");
      }

      setSuccess("Deposit submitted successfully! It is now pending review.");
      setAmount("");
      setReceipt(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
      <h2 className="mb-4 text-lg font-bold">Make a Deposit</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-[#0B2E1F] p-4 text-sm text-white">
          <p className="font-semibold text-[#A8E636]">Send payment to:</p>
          <p className="mt-1">
            {PAYMENT_ACCOUNT.accountName}: {PAYMENT_ACCOUNT.accountNumber} (
            {PAYMENT_ACCOUNT.method})
          </p>
          <p className="mt-2 text-white/70">
            Investment Amount: {MIN_INVESTMENT_PKR.toLocaleString()} —{" "}
            {MAX_INVESTMENT_PKR.toLocaleString()} PKR · Monthly profit 7%–10%
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">
            Investment Amount (PKR)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`e.g. 50000 (min ${MIN_INVESTMENT_PKR.toLocaleString()}, max ${MAX_INVESTMENT_PKR.toLocaleString()})`}
            min={MIN_INVESTMENT_PKR}
            max={MAX_INVESTMENT_PKR}
            className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4C6B2A] ${
              amount !== "" && !amountValid
                ? "border-red-500"
                : "border-[#2B2B2B]/20"
            }`}
          />
          {amount !== "" && !amountValid && (
            <p className="mt-1 text-xs text-red-600">
              Amount must be between {MIN_INVESTMENT_PKR.toLocaleString()} and{" "}
              {MAX_INVESTMENT_PKR.toLocaleString()} PKR.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">
            Receipt Screenshot <span className="text-red-600">*</span>
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-[#2B2B2B]/20 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[#4C6B2A] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          />
          {receipt && (
            <p className="mt-1 text-xs text-[#4C6B2A]">{receipt.name}</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="h-12 w-full rounded-lg bg-[#A8E636] text-base font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Deposit"}
        </button>
      </form>
    </div>
  );
}