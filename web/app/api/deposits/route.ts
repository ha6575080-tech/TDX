import { readJsonObject, isOwnedObjectPath, isPastOrPresentDate } from "@/lib/request-validation";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { isValidDepositAmount } from "@/lib/investment";
import { internalError } from "@/lib/api-errors";

/**
 * POST /api/deposits — member deposit creation (authoritative server validation)
 *
 * Validates deposit amount server-side (5k–2M) and uses authenticated user's identity.
 * Client-provided user_id is never trusted. This is the authoritative path;
 * direct Supabase inserts are still possible but are final-guarded by the DB CHECK
 * deposits_amount_range_check. The API returns 400 for any out-of-range/invalid amount.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: {
    amount?: unknown;
    payment_method?: string;
    cash_agent_name?: string | null;
    cash_agent_id?: string | null;
    cash_payment_date?: string | null;
    receipt_image_url?: string | null;
  };
  try {
    body = await readJsonObject(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawAmount = body.amount;
  // Accept numeric or numeric string, but must be finite number 5k-2M
  const amountNum = typeof rawAmount === "string" ? Number(rawAmount) : (rawAmount as number);

  if (!isValidDepositAmount(amountNum)) {
    return NextResponse.json({ error: "Deposit amount must be between 5000 and 2000000" }, { status: 400 });
  }

  const paymentMethod = body.payment_method ?? "online_transfer";
  if (!["online_transfer", "cash_agent"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment_method" }, { status: 400 });
  }

  // Enforce payment-method specific requirements (mirrors DB CHECK deposits_cash_fields_check)
  if (paymentMethod === "cash_agent") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (typeof body.cash_agent_name !== "string" || !body.cash_agent_name.trim() ||
        !isPastOrPresentDate(body.cash_payment_date, today)) {
      return NextResponse.json({ error: "cash_agent_name and cash_payment_date are required for cash_agent" }, { status: 400 });
    }
  } else {
    if (!isOwnedObjectPath(body.receipt_image_url, user.id)) {
      return NextResponse.json({ error: "A receipt from your own account is required" }, { status: 400 });
    }
  }

  const supabase = await createServiceRoleClient();

  const insertPayload: Record<string, unknown> = {
    user_id: user.id, // authoritative — never trust client user_id
    amount: amountNum,
    status: "pending",
    payment_method: paymentMethod,
  };

  if (paymentMethod === "cash_agent") {
    const { data: agent, error: agentError } = await supabase.from("payment_agents")
      .select("id, name").eq("name", body.cash_agent_name!.trim()).eq("is_active", true).maybeSingle();
    if (agentError) return internalError("deposits/agent", agentError);
    if (!agent) return NextResponse.json({ error: "Please select an active payment agent" }, { status: 400 });
    insertPayload.cash_agent_name = agent.name;
    insertPayload.cash_agent_id = agent.id;
    insertPayload.cash_payment_date = body.cash_payment_date;
    insertPayload.receipt_image_url = null;
  } else {
    insertPayload.receipt_image_url = body.receipt_image_url;
  }

  const { data, error: insertError } = await supabase
    .from("deposits")
    .insert(insertPayload as never)
    .select("id")
    .single();

  if (insertError) {
    // DB CHECK violation will surface here if validation somehow bypassed
    // PostgreSQL check_violation code 23514
    const code = (insertError as { code?: string }).code;
    if (code === "23514") {
      return NextResponse.json({ error: "Deposit amount must be between 5000 and 2000000" }, { status: 400 });
    }
    return internalError("deposits", insertError);
  }

  return NextResponse.json({ ok: true, deposit: data }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
