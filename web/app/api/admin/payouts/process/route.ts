import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError, logServerWarn } from "@/lib/api-errors";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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
  const { data: deposit, error: depErr } = await supabaseAdmin
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

  // Prevent duplicate payout for same deposit in same month
  const { data: existingPayout } = await supabaseAdmin
    .from("payouts")
    .select("id")
    .eq("deposit_id", deposit_id)
    .eq("month", month)
    .eq("year", year)
    .eq("status", "paid")
    .single();

  if (existingPayout) {
    return NextResponse.json(
      { error: "Payout already processed for this deposit this month" },
      { status: 409 }
    );
  }

  // 2. Insert payout record
  const { error: payoutErr } = await supabaseAdmin.from("payouts").insert({
    user_id: deposit.user_id,
    deposit_id,
    amount: payoutAmount,
    percentage_applied: percentage,
    month,
    year,
    status: "paid",
  });

  if (payoutErr) return internalError("admin/payouts/process", payoutErr);

  // 3. Update deposit: advance next_payout_date by 30 days, update percentage
  const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await supabaseAdmin
    .from("deposits")
    .update({
      next_payout_date: nextDate.toISOString(),
      monthly_profit_pct: percentage,
    })
    .eq("id", deposit_id);

  // 4. Notify user in-app
  const msgEn = `Your payout of Rs ${payoutAmount.toLocaleString()} (${percentage}%) has been processed. Please wait a few hours for it to appear in your account.`;
  const msgUr = `آپ کی Rs ${payoutAmount.toLocaleString()} (${percentage}%) کی ادائیگی کارروائی ہو گئی ہے۔ اکاؤنٹ میں ظاہر ہونے میں کچھ گھنٹے لگیں گے۔`;

  const { error: notifInsertError } = await supabaseAdmin
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
  await supabaseAdmin.from("messages").insert({
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