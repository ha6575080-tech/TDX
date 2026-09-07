"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MIN_INVESTMENT_PKR,
  MAX_INVESTMENT_PKR,
  PAYMENT_ACCOUNT,
  PAYMENT_METHODS,
  isValidDepositAmount,
} from "@/lib/investment";
import { PAYMENT_AGENTS } from "@/lib/paymentAgents";

// Matches the storage-layer limit enforced by the P0 hardening migration.
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

type DepositMethod = "online_transfer" | "cash_agent" | null;

export default function DepositForm() {
  const router = useRouter();
  const supabase = createClient();

  const [method, setMethod] = useState<DepositMethod>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("Shakeela");
  const [paymentDate, setPaymentDate] = useState("");
  const [agents, setAgents] = useState<{ id?: string; name: string }[]>(PAYMENT_AGENTS.filter((a) => a.isActive).map((a) => ({ name: a.name })));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCashConfirm, setShowCashConfirm] = useState(false);

  const amountNum = Number(amount);
  const amountValid = isValidDepositAmount(amountNum);

  // Load active cash agents from DB (authoritative), fallback to static
  useEffect(() => {
    async function loadAgents() {
      try {
        const { data } = await supabase.from("payment_agents").select("id, name, is_active").eq("is_active", true);
        if (data && data.length > 0) {
          setAgents(data.map((r: any) => ({ id: r.id, name: r.name })));
          // ensure selectedAgent is valid
          if (!data.find((r: any) => r.name === selectedAgent)) {
            setSelectedAgent(data[0].name);
          }
        }
      } catch {
        // fallback to static list already set
      }
    }
    loadAgents();
  }, [supabase, selectedAgent]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const canSubmitOnline = amountValid && receipt !== null;
  const canSubmitCash = amountValid && selectedAgent && paymentDate;

  // Online submit
  async function handleOnlineSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canSubmitOnline) {
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
      if (!user) throw new Error("You must be logged in.");
      const userId = user.id;

      // 1. Upload receipt
      const sanitizedName = receipt!.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const receiptPath = `${userId}/${Date.now()}_${sanitizedName}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(receiptPath, receipt!, { upsert: true });
      if (uploadError) throw uploadError;

      // 2. Lookup agent id for completeness (optional)
      const agentRecord = agents.find((a) => a.name === selectedAgent);

      // 3. Create deposit record — online_transfer
      const { data: deposit, error: depositError } = await supabase
        .from("deposits")
        .insert({
          user_id: userId,
          amount: amountNum,
          receipt_image_url: receiptPath,
          status: "pending",
          payment_method: PAYMENT_METHODS.ONLINE_TRANSFER,
        } as any)
        .select("id")
        .single();

      if (depositError) throw depositError;

      // 4. Post-process (AI + admin notification/email)
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: deposit.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to process deposit.");
      }

      setSuccess("Deposit submitted successfully! It is now pending verification.");
      setAmount("");
      setReceipt(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setLoading(false);
    }
  }

  // Cash submit — called after confirmation
  async function handleCashConfirm() {
    setError(null);
    setSuccess(null);

    if (!canSubmitCash) {
      setError("Please enter amount, select agent, and choose payment date.");
      return;
    }

    // Validate payment date is not future
    if (paymentDate > todayStr) {
      setError("Payment date cannot be in the future.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in.");
      const userId = user.id;

      const agentRecord = agents.find((a) => a.name === selectedAgent);

      const { data: deposit, error: depositError } = await supabase
        .from("deposits")
        .insert({
          user_id: userId,
          amount: amountNum,
          status: "pending",
          payment_method: PAYMENT_METHODS.CASH_AGENT,
          cash_agent_name: selectedAgent,
          cash_agent_id: agentRecord?.id ?? null,
          cash_payment_date: paymentDate,
          receipt_image_url: null,
        } as any)
        .select("id")
        .single();

      if (depositError) throw depositError;

      // Trigger admin notification/email via same endpoint (it will branch on payment_method)
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: deposit.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to process cash deposit.");
      }

      setSuccess("Cash deposit submitted successfully! It is now pending verification.");
      setAmount("");
      setPaymentDate("");
      setShowCashConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash deposit failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[#F7EFDF] p-6 text-[#2B2B2B] shadow-xl sm:p-8">
      <h2 className="mb-1 text-lg font-bold">Make a Deposit</h2>
      <p className="mb-4 text-xs text-[#6B6B6B]">Choose one method before submitting. Investment Amount: {MIN_INVESTMENT_PKR.toLocaleString()} — {MAX_INVESTMENT_PKR.toLocaleString()} PKR · Monthly profit 7%–10%</p>

      {/* Method selector — required */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setMethod("online_transfer");
            setError(null);
            setSuccess(null);
            setShowCashConfirm(false);
          }}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            method === "online_transfer"
              ? "border-[#4C6B2A] bg-[#E8F5D6] shadow-md"
              : "border-[#2B2B2B]/15 bg-white hover:border-[#4C6B2A]/40"
          }`}
        >
          <p className="text-sm font-bold">Online Transfer</p>
          <p className="mt-1 text-xs text-[#6B6B6B]">Jazz Cash to Shakeela</p>
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("cash_agent");
            setError(null);
            setSuccess(null);
            setShowCashConfirm(false);
          }}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            method === "cash_agent"
              ? "border-[#4C6B2A] bg-[#E8F5D6] shadow-md"
              : "border-[#2B2B2B]/15 bg-white hover:border-[#4C6B2A]/40"
          }`}
        >
          <p className="text-sm font-bold">Cash to Agent</p>
          <p className="mt-1 text-xs text-[#6B6B6B]">Hand cash to Shakeela</p>
        </button>
      </div>

      {!method && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Please select a deposit method above to continue.
        </div>
      )}

      {/* OPTION 1 — ONLINE TRANSFER */}
      {method === "online_transfer" && (
        <form onSubmit={handleOnlineSubmit} className="space-y-4">
          <div className="rounded-lg bg-[#0B2E1F] p-4 text-sm text-white">
            <p className="font-semibold text-[#A8E636]">Send payment to:</p>
            <p className="mt-1 font-medium">Jazz Cash</p>
            <p className="mt-0.5">Account Name: {PAYMENT_ACCOUNT.accountName}</p>
            <p>Jazz Cash Number: {PAYMENT_ACCOUNT.accountNumber}</p>
            <p className="mt-3 rounded bg-white/10 p-2.5 text-xs leading-relaxed text-white/90">
              Transfer your deposit amount to the above Jazz Cash account, then upload your payment receipt in TDX for verification.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Investment Amount (PKR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. 50000 (min ${MIN_INVESTMENT_PKR.toLocaleString()}, max ${MAX_INVESTMENT_PKR.toLocaleString()})`}
              min={MIN_INVESTMENT_PKR}
              max={MAX_INVESTMENT_PKR}
              className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4C6B2A] ${
                amount !== "" && !amountValid ? "border-red-500" : "border-[#2B2B2B]/20"
              }`}
            />
            {amount !== "" && !amountValid && (
              <p className="mt-1 text-xs text-red-600">
                {Number.isFinite(amountNum) && amountNum < MIN_INVESTMENT_PKR
                  ? `Minimum investment amount is ${MIN_INVESTMENT_PKR.toLocaleString()} PKR.`
                  : Number.isFinite(amountNum) && amountNum > MAX_INVESTMENT_PKR
                    ? `Maximum investment amount is ${MAX_INVESTMENT_PKR.toLocaleString()} PKR.`
                    : `Amount must be between ${MIN_INVESTMENT_PKR.toLocaleString()} and ${MAX_INVESTMENT_PKR.toLocaleString()} PKR.`}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">
              Payment Receipt / Proof <span className="text-red-600">*</span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-[#2B2B2B]/20 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[#4C6B2A] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            {receipt ? (
              <p className="mt-1 text-xs text-[#4C6B2A]">{receipt.name}</p>
            ) : (
              <p className="mt-1 text-xs text-[#6B6B6B]">Please upload your payment receipt.</p>
            )}
          </div>

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

          <button
            type="submit"
            disabled={!canSubmitOnline || loading}
            className="h-12 w-full rounded-lg bg-[#A8E636] text-base font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Online Deposit"}
          </button>
        </form>
      )}

      {/* OPTION 2 — CASH TO AGENT */}
      {method === "cash_agent" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#4C6B2A]/20 bg-white p-4">
            <h3 className="text-sm font-bold text-[#0B2E1F]">Available authorized cash agents:</h3>
            <div className="mt-3 space-y-2">
              {agents.map((agent) => (
                <label
                  key={agent.name}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                    selectedAgent === agent.name ? "border-[#4C6B2A] bg-[#E8F5D6]" : "border-[#2B2B2B]/15 bg-[#F7EFDF]"
                  }`}
                >
                  <input
                    type="radio"
                    name="cashAgent"
                    value={agent.name}
                    checked={selectedAgent === agent.name}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="h-4 w-4 accent-[#4C6B2A]"
                  />
                  <div>
                    <p className="text-sm font-semibold">Agent Name: {agent.name}</p>
                    <p className="text-xs text-[#6B6B6B]">Authorized cash collection agent</p>
                  </div>
                </label>
              ))}
              {agents.length === 0 && <p className="text-sm text-[#6B6B6B]">No active agents available.</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Investment Amount (PKR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. 50000 (min ${MIN_INVESTMENT_PKR.toLocaleString()}, max ${MAX_INVESTMENT_PKR.toLocaleString()})`}
              min={MIN_INVESTMENT_PKR}
              max={MAX_INVESTMENT_PKR}
              className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4C6B2A] ${
                amount !== "" && !amountValid ? "border-red-500" : "border-[#2B2B2B]/20"
              }`}
            />
            {amount !== "" && !amountValid && (
              <p className="mt-1 text-xs text-red-600">
                Amount must be between {MIN_INVESTMENT_PKR.toLocaleString()} and {MAX_INVESTMENT_PKR.toLocaleString()} PKR.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={todayStr}
              className="w-full rounded-lg border border-[#2B2B2B]/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4C6B2A]"
            />
            <p className="mt-1 text-xs text-[#6B6B6B]">Select the date on which the cash was handed to the agent.</p>
          </div>

          {!showCashConfirm ? (
            <>
              {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (!canSubmitCash) {
                    setError("Please enter amount, select Shakeela, and choose payment date.");
                    return;
                  }
                  if (paymentDate > todayStr) {
                    setError("Payment date cannot be in the future.");
                    return;
                  }
                  setShowCashConfirm(true);
                }}
                disabled={!canSubmitCash || loading}
                className="h-12 w-full rounded-lg bg-[#A8E636] text-base font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review Cash Payment
              </button>
            </>
          ) : (
            <div className="rounded-lg border border-[#4C6B2A]/30 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-bold text-[#0B2E1F]">Confirmation summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Deposit Amount:</span>
                  <span className="font-semibold">Rs {amountNum.toLocaleString("en-PK")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Payment Method:</span>
                  <span className="font-semibold">Cash to Agent</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Agent:</span>
                  <span className="font-semibold">{selectedAgent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Payment Date:</span>
                  <span className="font-semibold">{paymentDate ? new Date(paymentDate).toLocaleDateString("en-GB") : "—"}</span>
                </div>
              </div>

              {error && <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {success && <div className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCashConfirm(false)}
                  disabled={loading}
                  className="h-11 flex-1 rounded-lg border border-[#2B2B2B]/20 bg-white text-sm font-semibold text-[#2B2B2B] hover:bg-[#F7EFDF] disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCashConfirm}
                  disabled={loading}
                  className="h-11 flex-1 rounded-lg bg-[#A8E636] text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Confirm Cash Payment"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
