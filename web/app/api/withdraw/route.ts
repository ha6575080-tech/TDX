import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";

// Friendly member-facing messages for RPC rejection reasons. The raw reason
// code is preserved separately (response `reason` field + server log) for
// debugging; the UI must never display raw codes.
const FRIENDLY_REASONS: Record<string, string> = {
  not_eligible_30_days:
    "Withdrawals become available at the end of your 30-day cycle (within the final 24 hours). Please check back later.",
  return_investment_hold:
    "Your account is on hold because your return investment request has been approved. Withdrawals are paused until your investment is returned.",
  return_request_pending:
    "You have a pending return-investment request. Withdrawals are paused until it has been reviewed by the Super Admin.",
  unresolved_withdrawal_exists:
    "You already have a withdrawal request being processed. Please wait until it is completed or rejected.",
  duplicate_cycle_withdrawal:
    "You have already requested a withdrawal for this 30-day cycle. One withdrawal per cycle is allowed.",
  no_approved_investment:
    "No approved investment was found on your account. Please contact support if this looks wrong.",
  no_cycle_anchor:
    "Your investment cycle has not started yet. Please contact support if this looks wrong.",
};

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

async function sendWithdrawalEmail(opts: {
  fullName: string;
  address: string;
  mobileNumber: string;
  accountNumber: string;
  paymentMethod: string;
  cycleNumber: number | null;
  principal: number;
}) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("SMTP not configured — skipping withdrawal notification email.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `New Withdrawal Request — ${opts.fullName}`,
      html: `
        <h2>New Monthly Profit Withdrawal Request</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Full Name</b></td><td>${opts.fullName}</td></tr>
          <tr><td><b>Address</b></td><td>${opts.address}</td></tr>
          <tr><td><b>Mobile Number</b></td><td>${opts.mobileNumber}</td></tr>
          <tr><td><b>Account Number</b></td><td>${opts.accountNumber}</td></tr>
          <tr><td><b>Payment Method</b></td><td>${opts.paymentMethod}</td></tr>
          <tr><td><b>Cycle #</b></td><td>${opts.cycleNumber ?? "-"}</td></tr>
          <tr><td><b>Active Investment</b></td><td>${opts.principal} PKR</td></tr>
          <tr><td><b>Note</b></td><td>Final profit amount will be calculated server-side when the Super Admin selects the monthly rate (7–10%).</td></tr>
        </table>
      `,
    });
  } catch (err) {
    console.warn("Failed to send withdrawal email:", err);
  }
}

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;

  const userId = user.id;

  // SECURITY: the request body carries NO financial values. The member
  // cannot submit a withdrawal amount, a rate, or any other money figure.
  // Everything is derived server-side by the request_withdrawal() RPC:
  // principal via active_investment(), the current 30-day cycle via
  // withdrawal_current_cycle(), and all hold/eligibility/idempotency gates.

  const supabase = await createServiceRoleClient();

  // 1. Fetch the user's profile for the audit snapshot + email.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "full_name, address, mobile_number, account_number, payment_method"
    )
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Profile not found" },
      { status: 404 }
    );
  }

  // 2. Create the withdrawal through the atomic zero-argument RPC. The RPC
  //    runs with the USER-scoped client so auth.uid() matches this session;
  //    it validates every gate server-side and inserts the pending
  //    withdrawal only when the member is eligible.
  const userClient = await createClient();
  const { data: rpcResult, error: rpcError } = await userClient.rpc(
    "request_withdrawal"
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const result = rpcResult as {
    ok: boolean;
    reason?: string;
    cycle_number?: number;
    principal?: number;
    withdrawal_id?: string;
  };

  if (!result?.ok) {
    const reason = result?.reason ?? "unknown";
    console.warn(`[withdraw] rejected: ${reason}`, { userId });
    return NextResponse.json(
      {
        error:
          FRIENDLY_REASONS[reason] ??
          "Your withdrawal request could not be processed. Please try again or contact support.",
        reason,
      },
      { status: 400 }
    );
  }

  // 3. Read back the created row for the response.
  const { data: withdrawal } = await supabase
    .from("withdrawals")
    .select("id, amount, fee, net_amount, status, requested_at, cycle_number")
    .eq("id", result.withdrawal_id)
    .single();

  // 4. Email the admin (skips silently if SMTP not configured).
  await sendWithdrawalEmail({
    fullName: profile.full_name || "Unknown",
    address: profile.address ?? "",
    mobileNumber: profile.mobile_number ?? "",
    accountNumber: profile.account_number ?? "",
    paymentMethod: profile.payment_method ?? "",
    cycleNumber: result.cycle_number ?? null,
    principal: Number(result.principal ?? 0),
  });

  return NextResponse.json({ success: true, withdrawal });
}