import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerWarn } from "@/lib/api-errors";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

/**
 * POST /api/returns/request
 *
 * Member submits a Return Investment request.
 * - Identity comes exclusively from the authenticated session (auth.uid()).
 * - The return amount is derived SERVER-SIDE by the RPC from authoritative
 *   approved-deposit records — the client never states an amount.
 * - Duplicate unresolved requests are rejected atomically (RPC + partial
 *   unique index in the database).
 */
export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;

  const userClient = await createClient();
  const { data: rpcResult, error: rpcError } = await userClient.rpc(
    "request_return_investment"
  );

  if (rpcError) {
    return internalError("returns/request", rpcError);
  }

  const result = rpcResult as {
    ok: boolean;
    reason?: string;
    request_id?: string;
    amount?: number;
    requested_at?: string;
  };

  if (!result?.ok) {
    switch (result?.reason) {
      case "duplicate_unresolved_request":
        return NextResponse.json(
          { error: "You already have an unresolved return investment request." },
          { status: 409 }
        );
      case "unresolved_withdrawal_exists":
        return NextResponse.json(
          {
            error:
              "You have a pending withdrawal. Please wait until it is processed before requesting your investment back.",
          },
          { status: 409 }
        );
      case "no_approved_investment":
        return NextResponse.json(
          { error: "No approved investment found to return." },
          { status: 400 }
        );
      default:
        return NextResponse.json(
          { error: result?.reason ?? "Request rejected." },
          { status: 400 }
        );
    }
  }

  // Notify the Super Admin by email with enough info to identify the
  // request (no secrets, no unnecessary personal data).
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
        subject: `New Return Investment Request — ${escapeHtml(profile?.full_name ?? "Member")}`,
        html: `
          <h2>New Return Investment Request</h2>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
            <tr><td><b>Member Name</b></td><td>${escapeHtml(profile?.full_name ?? "Unknown")}</td></tr>
            <tr><td><b>Member ID</b></td><td>${escapeHtml(user.id)}</td></tr>
            <tr><td><b>Username</b></td><td>${escapeHtml(profile?.username ?? "Unknown")}</td></tr>
            <tr><td><b>Original Investment Amount</b></td><td>${result.amount} PKR</td></tr>
            <tr><td><b>Request ID</b></td><td>${result.request_id}</td></tr>
            <tr><td><b>Request Date/Time</b></td><td>${new Date().toLocaleString("en-PK")}</td></tr>
          </table>
          <p>Action required: review this request in the TDX Admin Panel → Returns.</p>
        `,
      });
    } catch (err) {
      logServerWarn("returns/request", err, "failed to send return-investment email");
    }
  }

  return NextResponse.json({
    success: true,
    requestId: result.request_id,
    amount: result.amount,
    requestedAt: result.requested_at,
  });
}