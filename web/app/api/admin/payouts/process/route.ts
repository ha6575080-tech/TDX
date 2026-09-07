import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError, logServerWarn } from "@/lib/api-errors";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabaseUrl is required.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { deposit_id, percentage } = body as {
    deposit_id: string;
    percentage: number;
  };

  if (!deposit_id || ![7, 8, 9, 10].includes(percentage)) {
    return NextResponse.json(
      { error: "deposit_id required and percentage must be 7, 8, 9, or 10" },
      { status: 400 }
    );
  }

  // 1. Fetch the deposit
  const { data: deposit, error: depErr } = await getSupabaseAdmin()
    .from("deposits")
    .select("id, user_id, amount, next_payout_date, monthly_profit_pct")
    .eq("id", deposit_id)
    .eq("status", "approved")
    .single();

  if (depErr || !deposit) {
    return NextResponse.json({ error: "Deposit not found or not approved" }, { status: 404 });
  }

  const payoutAmount = (deposit.amount * percentage) / 100;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Cross-ledger guard: profits ledger already marks this user/month as paid
  // (via legacy payout or via withdrawal). A per-deposit payout for the same month
  // would double-represent the same economic event.
  const { data: existingProfit } = await getSupabaseAdmin()
    .from("profits")
    .select("id")
    .eq("user_id", deposit.user_id)
    .eq("month", month)
    .eq("year", year)
    .eq("status", "paid")
    .maybeSingle();
  if (existingProfit) {
    return NextResponse.json(
      { error: "Profit already marked paid for this user/month — per-deposit payout would double-count" },
      { status: 409 }
    );
  }

  // Prevent duplicate payout for same deposit in same month (app-level check).
  // The authoritative guard is the DB unique index payouts_unique_deposit_month_year
  // (42703/42P01 fixed by 20260908000001 migration which created payouts + missing columns).
  const { data: existingPayout } = await getSupabaseAdmin()
    .from("payouts")
    .select("id")
    .eq("deposit_id", deposit_id)
    .eq("month", month)
    .eq("year", year)
    .eq("status", "paid")
    .maybeSingle();

  if (existingPayout) {
    return NextResponse.json(
      { error: "Payout already processed for this deposit this month" },
      { status: 409 }
    );
  }

  // 2. Insert payout record — unique index guarantees exactly-once per month even under race.
  const { error: payoutErr } = await getSupabaseAdmin().from("payouts").insert({
    user_id: deposit.user_id,
    deposit_id,
    amount: payoutAmount,
    percentage_applied: percentage,
    month,
    year,
    status: "paid",
  });

  if (payoutErr) {
    // 23505 = unique_violation from the partial index => concurrent duplicate
    if ((payoutErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Payout already processed for this deposit this month" },
        { status: 409 }
      );
    }
    return internalError("admin/payouts/process", payoutErr);
  }

  // 3. Update deposit: advance next_payout_date by 30 days, update percentage
  const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await getSupabaseAdmin()
    .from("deposits")
    .update({
      next_payout_date: nextDate.toISOString(),
      monthly_profit_pct: percentage,
    })
    .eq("id", deposit_id);

  // 4. Notify user in-app
  const msgEn = `Your payout of Rs ${payoutAmount.toLocaleString()} (${percentage}%) has been processed. Please wait a few hours for it to appear in your account.`;
  const msgUr = `آپ کی Rs ${payoutAmount.toLocaleString()} (${percentage}%) کی ادائیگی کارروائی ہو گئی ہے۔ اکاؤنٹ میں ظاہر ہونے میں کچھ گھنٹے لگیں گے۔`;

  const { error: notifInsertError } = await getSupabaseAdmin()
    .from("notifications")
    .insert({
      user_id: deposit.user_id,
      title: "Payout Processed",
      title_ur: "ادائیگی کارروائی ہو گئی",
      message: msgEn,
      message_ur: msgUr,
    });
  if (notifInsertError) {
    // Payout is already processed and authoritative — log only, never fail.
    logServerWarn("admin/payouts/process", notifInsertError, "notification insert failed");
  }

  // 5. Also insert a chat message so user sees it in their thread
  await getSupabaseAdmin().from("messages").insert({
    user_id: deposit.user_id,
    message: msgEn,
    message_ur: msgUr,
    sender: "system",
  });

  return NextResponse.json({
    ok: true,
    payout: { amount: payoutAmount, percentage, next_payout_date: nextDate.toISOString() },
  });
}