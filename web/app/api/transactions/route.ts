import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { extractErrorInfo } from "@/lib/errors";

/**
 * GET /api/transactions
 *
 * Unified, session-scoped transaction list for the authenticated user.
 * Every query is filtered by the SERVER-DERIVED user id — ownership can
 * never come from the browser, so cross-user (IDOR) access is impossible.
 * Amounts/statuses are raw authoritative DB values — never computed
 * client-side.
 */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = user.id;

  const supabase = await createClient();

  const [depositsRes, withdrawalsRes, profitsRes, returnsRes, upgradesRes] =
    await Promise.all([
      supabase
        .from("deposits")
        .select("id, amount, status, ai_verdict, uploaded_at, approved_at")
        .eq("user_id", userId)
        .order("uploaded_at", { ascending: false })
        .limit(100),
      supabase
        .from("withdrawals")
        .select("id, amount, net_amount, fee, status, requested_at, processed_at")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(100),
      supabase
        .from("profits")
        .select("id, amount, status, month, year, payout_date")
        .eq("user_id", userId)
        .order("payout_date", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("investment_returns")
        .select("id, amount, returned_amount, status, requested_at, completed_at")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(50),
      supabase
        .from("investment_upgrades")
        .select("id, previous_amount, requested_amount, increase_amount, status, requested_at, activated_at")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(50),
    ]);

  const firstError =
    depositsRes.error || withdrawalsRes.error || profitsRes.error ||
    returnsRes.error || upgradesRes.error;
  if (firstError) {
    const info = extractErrorInfo(firstError, "Could not load transactions.");
    return NextResponse.json({ error: info.friendly }, { status: 500 });
  }

  type Tx = {
    id: string;
    type: "deposit" | "withdrawal" | "payout" | "return" | "upgrade";
    amount: number;
    status: string;
    date: string;
    meta: Record<string, string | number | null>;
  };

  const txs: Tx[] = [];

  for (const d of depositsRes.data ?? []) {
    txs.push({
      id: d.id,
      type: "deposit",
      amount: Number(d.amount ?? 0),
      status: String(d.status),
      date: String(d.uploaded_at ?? d.approved_at ?? ""),
      meta: { ai_verdict: d.ai_verdict ?? null, approved_at: d.approved_at ?? null },
    });
  }
  for (const w of withdrawalsRes.data ?? []) {
    txs.push({
      id: w.id,
      type: "withdrawal",
      amount: Number(w.amount ?? 0),
      status: String(w.status),
      date: String(w.requested_at ?? ""),
      meta: { net_amount: w.net_amount ?? null, fee: w.fee ?? null, processed_at: w.processed_at ?? null },
    });
  }
  for (const p of profitsRes.data ?? []) {
    txs.push({
      id: p.id,
      type: "payout",
      amount: Number(p.amount ?? 0),
      status: String(p.status),
      date: String(p.payout_date ?? ""),
      meta: { month: p.month ?? null, year: p.year ?? null },
    });
  }
  for (const r of returnsRes.data ?? []) {
    txs.push({
      id: r.id,
      type: "return",
      amount: Number(r.amount ?? r.returned_amount ?? 0),
      status: String(r.status),
      date: String(r.requested_at ?? ""),
      meta: { returned_amount: r.returned_amount ?? null, completed_at: r.completed_at ?? null },
    });
  }
  for (const u of upgradesRes.data ?? []) {
    txs.push({
      id: u.id,
      type: "upgrade",
      amount: Number(u.requested_amount ?? 0),
      status: String(u.status),
      date: String(u.requested_at ?? ""),
      meta: { previous_amount: u.previous_amount ?? null, increase_amount: u.increase_amount ?? null, activated_at: u.activated_at ?? null },
    });
  }

  txs.sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ transactions: txs });
}
