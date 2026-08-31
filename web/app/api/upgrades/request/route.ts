import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerWarn } from "@/lib/api-errors";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

/**
 * POST /api/upgrades/request
 *
 * Member submits an Investment Upgrade request.
 * - Identity comes exclusively from the authenticated session (auth.uid()).
 * - The current active investment is derived SERVER-SIDE by the RPC; the
 *   client only proposes a new amount, which must strictly exceed the
 *   authoritative current amount.
 * - The upgrade is recorded as PENDING and does NOT change the active
 *   investment for the current payout/withdrawal cycle. It becomes active
 *   only after the next completed withdrawal or paid profit (server event).
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { newAmount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawAmount = body.newAmount;
  if (
    typeof rawAmount !== "number" ||
    !Number.isFinite(rawAmount) ||
    rawAmount <= 0
  ) {
    return NextResponse.json(
      { error: "A positive numeric amount is required." },
      { status: 400 }
    );
  }

  const userClient = await createClient();
  const { data: rpcResult, error: rpcError } = await userClient.rpc(
    "request_investment_upgrade",
    { p_new_amount: rawAmount }
  );

  if (rpcError) {
    return internalError("upgrades/request", rpcError);
  }

  const result = rpcResult as {
    ok: boolean;
    reason?: string;
    upgrade_id?: string;
    previous_amount?: number;
    requested_amount?: number;
    increase_amount?: number;
    current_amount?: number;
  };

  if (!result?.ok) {
    switch (result?.reason) {
      case "duplicate_pending_upgrade":
        return NextResponse.json(
          { error: "You already have a pending investment upgrade." },
          { status: 409 }
        );
      case "return_investment_hold":
        return NextResponse.json(
          {
            error:
              "Your account is on hold for a return investment. Upgrades are not available.",
          },
          { status: 409 }
        );
      case "no_active_investment":
        return NextResponse.json(
          { error: "No approved investment found to upgrade." },
          { status: 400 }
        );
      case "invalid_upgrade":
        return NextResponse.json(
          {
            error: `The new amount must be greater than your current investment (${result.current_amount} PKR).`,
            currentAmount: result.current_amount,
          },
          { status: 400 }
        );
      default:
        return NextResponse.json(
          { error: result?.reason ?? "Upgrade rejected." },
          { status: 400 }
        );
    }
  }

  // Notify the Super Admin by email for review/awareness.
  if (SMTP_USER && SMTP_PASS) {
    try {
      const adminClient = await createServiceRoleClient();
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single();

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });

      await transporter.sendMail({
        from: SMTP_USER,
        to: ADMIN_EMAIL,
        subject: `New Investment Upgrade Request — ${escapeHtml(profile?.full_name ?? "Member")}`,
        html: `
          <h2>New Investment Upgrade Request</h2>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
            <tr><td><b>Member Name</b></td><td>${escapeHtml(profile?.full_name ?? "Unknown")}</td></tr>
            <tr><td><b>Member ID</b></td><td>${escapeHtml(user.id)}</td></tr>
            <tr><td><b>Username</b></td><td>${escapeHtml(profile?.username ?? "Unknown")}</td></tr>
            <tr><td><b>Previous Investment</b></td><td>${result.previous_amount} PKR</td></tr>
            <tr><td><b>New Investment</b></td><td>${result.requested_amount} PKR</td></tr>
            <tr><td><b>Increase</b></td><td>${result.increase_amount} PKR</td></tr>
            <tr><td><b>Upgrade ID</b></td><td>${result.upgrade_id}</td></tr>
            <tr><td><b>Date/Time</b></td><td>${new Date().toLocaleString("en-PK")}</td></tr>
          </table>
          <p>Note: the upgrade becomes effective automatically after the member's next completed withdrawal or paid profit.</p>
        `,
      });
    } catch (err) {
      logServerWarn("upgrades/request", err, "failed to send upgrade email");
    }
  }

  return NextResponse.json({
    success: true,
    upgradeId: result.upgrade_id,
    previousAmount: result.previous_amount,
    requestedAmount: result.requested_amount,
    increaseAmount: result.increase_amount,
  });
}