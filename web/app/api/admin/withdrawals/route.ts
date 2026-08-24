import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isAllowedMonthlyRate } from "@/lib/investment";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: withdrawals, error: withdrawalsError } = await supabase
    .from("withdrawals")
    .select(
      "id, user_id, amount, fee, net_amount, status, user_details, requested_at, processed_at, monthly_profit_rate, cycle_number, cycle_start, cycle_end, profiles(full_name, username, mobile_number)"
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  if (withdrawalsError) {
    return NextResponse.json({ error: withdrawalsError.message }, { status: 500 });
  }

  interface WithdrawalRow {
    id: string;
    user_id: string;
    amount: number | null;
    fee: number | null;
    net_amount: number | null;
    status: string;
    user_details: Record<string, string> | null;
    requested_at: string;
    processed_at: string | null;
    monthly_profit_rate: number | null;
    cycle_number: number | null;
    cycle_start: string | null;
    cycle_end: string | null;
    profiles: { full_name?: string; username?: string; mobile_number?: string }[];
  }

  const parsed = (withdrawals ?? []).map((w: WithdrawalRow) => ({
    id: w.id,
    user_id: w.user_id,
    amount: w.amount,
    fee: w.fee,
    net_amount: w.net_amount,
    status: w.status,
    user_details: w.user_details,
    requested_at: w.requested_at,
    processed_at: w.processed_at,
    monthly_profit_rate: w.monthly_profit_rate,
    cycle_number: w.cycle_number,
    cycle_start: w.cycle_start,
    cycle_end: w.cycle_end,
    fullName: w.profiles?.[0]?.full_name ?? "Unknown",
    username: w.profiles?.[0]?.username ?? "Unknown",
    mobile: w.profiles?.[0]?.mobile_number ?? "Unknown",
  }));

  return NextResponse.json({ withdrawals: parsed });
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: {
    withdrawalId?: string;
    action?: "complete" | "reject";
    monthlyProfitRate?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { withdrawalId, action } = body;
  if (!withdrawalId || !action) {
    return NextResponse.json(
      { error: "withdrawalId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { data: withdrawal, error: fetchError } = await supabase
    .from("withdrawals")
    .select("id, user_id, amount, status")
    .eq("id", withdrawalId)
    .single();

  if (fetchError || !withdrawal) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Withdrawal not found" },
      { status: 404 }
    );
  }

  const userId = withdrawal.user_id;

  if (action === "complete") {
    // The Super Admin MUST select a monthly profit rate (7/8/9/10). The
    // rate is validated here AND re-validated inside the atomic RPC + the
    // DB CHECK constraint. The member can never supply this value.
    const rate = body.monthlyProfitRate;
    if (!isAllowedMonthlyRate(rate)) {
      return NextResponse.json(
        { error: "A monthly profit rate of 7%, 8%, 9%, or 10% is required." },
        { status: 400 }
      );
    }

    // ATOMIC completion: cycle validation + server-side profit calculation
    // (principal × rate ÷ 100) + PKR 100 fee + withdrawal completion +
    // profits-ledger recording + audit logging + pending-upgrade activation
    // all happen in ONE database transaction. There is no intermediate state
    // where the withdrawal is completed but the ledger/audit step failed.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "complete_profit_withdrawal",
      {
        p_withdrawal_id: withdrawalId,
        p_rate: rate,
        p_actor: user.id,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as {
      ok: boolean;
      reason?: string;
      profit?: number;
      fee?: number;
      net?: number;
      rate?: number;
      cycle_number?: number | null;
    };

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.reason ?? "Completion failed." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "completed",
      profit: result.profit,
      fee: result.fee,
      net: result.net,
      rate: result.rate,
      cycle_number: result.cycle_number,
    });
  }

  if (action === "reject") {
    const { data: updatedRows, error: updateError } = await supabase
      .from("withdrawals")
      .update({ status: "rejected", processed_at: new Date().toISOString() })
      .eq("id", withdrawalId)
      .eq("status", "pending")
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Withdrawal is not pending — already processed." },
        { status: 409 }
      );
    }

    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: `Your monthly profit withdrawal request has been rejected.`,
      message_ur: `آپ کی ماہانہ منافع نکاسی کی درخواست مسترد کر دی گئی ہے۔`,
      is_read: false,
    });
    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}