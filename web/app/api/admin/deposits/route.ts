import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPushToSubscriptions } from "@/lib/push";
import { internalError, logServerWarn, escapeHtml } from "@/lib/api-errors";
import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

/**
 * Create an in-app notification for a specific member and attempt best-effort
 * push delivery. Uses the existing `notifications` table and push helper.
 * Neither failure is allowed to affect the financial state transition.
 */
async function notifyMember(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  title: string,
  message: string,
  title_ur: string,
  message_ur: string
) {
  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: userId,
    title,
    message,
    title_ur,
    message_ur,
    is_read: false,
  });
  if (notifError) {
    logServerWarn("admin/deposits", notifError, "in-app notification insert failed (financial state already applied)");
  }

  try {
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
    if (subs && subs.length > 0) {
      const pushResult = await sendPushToSubscriptions(subs as Array<{ endpoint: string; p256dh: string; auth: string }>, JSON.stringify({ title, message }));
      if (pushResult.failed > 0) {
        logServerWarn("admin/deposits", new Error("push_delivery_partial_failure"), `push: sent=${pushResult.sent} failed=${pushResult.failed}`);
      }
    }
  } catch (pushErr) {
    logServerWarn("admin/deposits", pushErr, "push delivery failed (non-blocking)");
  }
}

async function sendMemberEmail(opts: { to: string; subject: string; html: string }) {
  if (!SMTP_USER || !SMTP_PASS) return;
  if (!opts.to) return;
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    logServerWarn("admin/deposits", err, "failed to send member email (non-blocking)");
  }
}

function nextDayISO(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function formatDateGB(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB");
}
function formatDatePK(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PK");
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: deposits, error: depositsError } = await supabase
    .from("deposits")
    .select(
      "id, user_id, package_id, amount, receipt_image_url, ai_verdict, ai_confidence, status, uploaded_at, approved_at, invoice_url, admin_notes, payment_method, cash_agent_name, cash_agent_id, cash_payment_date, reviewed_at, reviewed_by, packages(package_name, monthly_return_percent)"
    )
    .order("uploaded_at", { ascending: false })
    .limit(200);

  if (depositsError) {
    return internalError("admin/deposits", depositsError);
  }

  const userIds = [...new Set((deposits ?? []).map((d: any) => d.user_id))];
  const profileMap = new Map<string, any>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, username, mobile_number, email")
      .in("id", userIds);
    if (profilesError) {
      return internalError("admin/deposits", profilesError);
    }
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }
  }

  const parsed = (deposits ?? []).map((d: any) => {
    const profile = profileMap.get(d.user_id);
    return {
      id: d.id,
      user_id: d.user_id,
      package_id: d.package_id,
      amount: d.amount,
      receipt_image_url: d.receipt_image_url,
      ai_verdict: d.ai_verdict,
      ai_confidence: d.ai_confidence,
      status: d.status,
      uploaded_at: d.uploaded_at,
      approved_at: d.approved_at,
      invoice_url: d.invoice_url,
      admin_notes: d.admin_notes,
      payment_method: d.payment_method ?? "online_transfer",
      cash_agent_name: d.cash_agent_name ?? null,
      cash_agent_id: d.cash_agent_id ?? null,
      cash_payment_date: d.cash_payment_date ?? null,
      reviewed_at: d.reviewed_at ?? null,
      reviewed_by: d.reviewed_by ?? null,
      fullName: profile?.full_name ?? "Unknown",
      username: profile?.username ?? "Unknown",
      mobile: profile?.mobile_number ?? "Unknown",
      email: profile?.email ?? null,
      packageName: d.packages?.package_name ?? "Investment",
      monthlyReturnPercent: d.packages?.monthly_return_percent ?? 0,
    };
  });

  return NextResponse.json({ deposits: parsed });
}

export async function POST(request: Request) {
  const { error, user: adminUser } = await requireAdmin();
  if (error) return error;
  const adminUserId = (adminUser as any)?.id ?? null;

  let body: { depositId?: string; action?: "approve" | "reject"; admin_notes?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { depositId, action } = body;
  if (!depositId || !action) {
    return NextResponse.json({ error: "depositId and action are required" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  const { data: deposit, error: depositError } = await supabase
    .from("deposits")
    .select("id, user_id, package_id, amount, status, approved_at, payment_method, cash_agent_name, cash_payment_date, receipt_image_url")
    .eq("id", depositId)
    .single();

  if (depositError || !deposit) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }

  const userId = deposit.user_id;
  const paymentMethod = (deposit as any).payment_method ?? "online_transfer";
  const methodLabel = paymentMethod === "cash_agent" ? "CASH TO AGENT" : "ONLINE TRANSFER";
  const cashAgent = (deposit as any).cash_agent_name ?? "Shakeela";
  const cashDateRaw = (deposit as any).cash_payment_date ?? null;

  const EXPECTED_STATUS = "pending";

  // Fetch member profile for email + display
  const { data: memberProfile } = await supabase.from("profiles").select("full_name, username, email").eq("id", userId).single();
  const memberName = memberProfile?.full_name ?? memberProfile?.username ?? "Member";
  const memberEmail = memberProfile?.email ?? null;

  if (action === "approve") {
    // SERVER-SIDE authoritative now and next-day cycle start
    const approvalNow = new Date();
    const nowISO = approvalNow.toISOString();
    const cycleStartISO = nextDayISO(approvalNow);
    const cycleStartDateGB = formatDateGB(cycleStartISO);
    const cycleStartDatePK = formatDatePK(cycleStartISO);
    const invoiceUrl = `/invoice/${depositId}`;

    const { data: updatedRows, error: updateDepositError } = await supabase
      .from("deposits")
      .update({
        status: "approved",
        approved_at: nowISO,
        invoice_url: invoiceUrl,
        reviewed_at: nowISO,
        reviewed_by: adminUserId,
      } as any)
      .eq("id", depositId)
      .eq("status", EXPECTED_STATUS)
      .select("id");
    if (updateDepositError) {
      return internalError("admin/deposits", updateDepositError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: "Deposit is not pending — already processed." }, { status: 409 });
    }

    // Financial activation: is_active true, profit cycle starts NEXT DAY (server-calculated).
    // DEPOSIT/STATUS INDEPENDENCE: approval must NOT touch is_suspended.
    // Member account status is an admin-controlled account-control function
    // (see /api/admin/users set_status + set_member_status RPC). A Super
    // Admin's manual suspension takes precedence and is never silently
    // cleared by deposit activity — approving a deposit for a suspended
    // member keeps them suspended until an admin explicitly reactivates.
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        is_active: true,
        profit_activation_date: cycleStartISO,
      })
      .eq("id", userId);
    if (updateProfileError) {
      return internalError("admin/deposits", updateProfileError);
    }

    const amountStr = Number(deposit.amount).toLocaleString("en-PK");

    // Inbox/chat message (system)
    const msgEn = `Congratulations! Your deposit of Rs ${amountStr} has been received and approved. Your monthly profit cycle will start from ${cycleStartDateGB}.`;
    const msgUr =
      paymentMethod === "cash_agent"
        ? `مبارک ہو! آپ کی نقد جمع شدہ رقم Rs ${amountStr} موصول اور منظور ہو گئی ہے۔ آپ کا ماہانہ منافع سائیکل ${cycleStartDateGB} سے شروع ہوگا۔`
        : `مبارک ہو! آپ کی آن لائن جمع شدہ رقم Rs ${amountStr} موصول اور منظور ہو گئی ہے۔ آپ کا ماہانہ منافع سائیکل ${cycleStartDateGB} سے شروع ہوگا۔`;
    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: msgEn,
      message_ur: msgUr,
      is_read: false,
    });
    if (msgError) {
      return internalError("admin/deposits", msgError);
    }

    // In-app notification (best-effort)
    await notifyMember(
      supabase,
      userId,
      "Deposit Approved",
      msgEn,
      "ڈپازٹ منظور",
      msgUr
    );

    // Member email IF registered email exists (best-effort)
    if (memberEmail) {
      const emailHtml =
        paymentMethod === "cash_agent"
          ? `
            <h2>Deposit Approved — Cash to Agent</h2>
            <p>Member: ${escapeHtml(memberName)}</p>
            <p>Amount: Rs ${escapeHtml(amountStr)}</p>
            <p>Method: ${escapeHtml(methodLabel)}</p>
            <p>Agent: ${escapeHtml(cashAgent)}</p>
            <p>Cash Payment Date: ${cashDateRaw ? escapeHtml(formatDateGB(cashDateRaw)) : "—"}</p>
            <p><b>${escapeHtml(msgEn)}</b></p>
          `
          : `
            <h2>Deposit Approved — Online Transfer</h2>
            <p>Member: ${escapeHtml(memberName)}</p>
            <p>Amount: Rs ${escapeHtml(amountStr)}</p>
            <p>Method: ${escapeHtml(methodLabel)}</p>
            <p>Payment Account: Shakeela — Jazz Cash 0308-3958294</p>
            <p><b>${escapeHtml(msgEn)}</b></p>
          `;
      await sendMemberEmail({
        to: memberEmail,
        subject: `TDX Deposit Approved — Rs ${amountStr} — Cycle starts ${cycleStartDateGB}`,
        html: emailHtml,
      });
    }

    return NextResponse.json({ success: true, status: "approved", cycleStart: cycleStartISO });
  }

  if (action === "reject") {
    const rejectionReason = body.admin_notes ?? body.reason ?? null;
    const nowISO = new Date().toISOString();
    const updatePayload: any = {
      status: "rejected",
      admin_notes: rejectionReason ?? `Rejected — ${methodLabel} verification did not pass`,
      reviewed_at: nowISO,
      reviewed_by: adminUserId,
    };

    const { data: updatedRows, error: updateDepositError } = await supabase
      .from("deposits")
      .update(updatePayload)
      .eq("id", depositId)
      .eq("status", EXPECTED_STATUS)
      .select("id");
    if (updateDepositError) {
      return internalError("admin/deposits", updateDepositError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: "Deposit is not pending — already processed." }, { status: 409 });
    }

    const amountStr = Number(deposit.amount).toLocaleString("en-PK");
    const reasonSuffix = rejectionReason ? ` Reason: ${rejectionReason}.` : "";

    const msgEn =
      paymentMethod === "cash_agent"
        ? `Your cash deposit of Rs ${amountStr} via agent ${cashAgent} on ${cashDateRaw ? formatDateGB(cashDateRaw) : "—"} was not approved. Status: Rejected.${reasonSuffix} Please contact support for details.`
        : `Your online transfer deposit of Rs ${amountStr} via Jazz Cash (Shakeela — 0308-3958294) was not approved. Status: Rejected.${reasonSuffix} Please check your receipt and try again, or contact support.`;
    const msgUr =
      paymentMethod === "cash_agent"
        ? `آپ کی نقد جمع شدہ رقم Rs ${amountStr} (ایجنٹ: ${cashAgent}) منظور نہیں ہوئی۔ حالت: مسترد۔${reasonSuffix}`
        : `آپ کی آن لائن جمع شدہ رقم Rs ${amountStr} (Jazz Cash: Shakeela — 0308-3958294) منظور نہیں ہوئی۔ حالت: مسترد۔${reasonSuffix}`;

    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: msgEn,
      message_ur: msgUr,
      is_read: false,
    });
    if (msgError) {
      return internalError("admin/deposits", msgError);
    }

    await notifyMember(supabase, userId, "Deposit Rejected", msgEn, "ڈپازٹ مسترد", msgUr);

    if (memberEmail) {
      await sendMemberEmail({
        to: memberEmail,
        subject: `TDX Deposit Rejected — Rs ${amountStr} — ${methodLabel}`,
        html: `
          <h2>Deposit Rejected — ${escapeHtml(methodLabel)}</h2>
          <p>Member: ${escapeHtml(memberName)}</p>
          <p>Amount: Rs ${escapeHtml(amountStr)}</p>
          <p>Method: ${escapeHtml(methodLabel)}</p>
          ${paymentMethod === "cash_agent" ? `<p>Agent: ${escapeHtml(cashAgent)}</p><p>Cash Payment Date: ${cashDateRaw ? escapeHtml(formatDateGB(cashDateRaw)) : "—"}</p>` : `<p>Payment Account: Shakeela — Jazz Cash 0308-3958294</p>`}
          <p>Status: <b>Rejected</b></p>
          ${rejectionReason ? `<p>Reason: ${escapeHtml(rejectionReason)}</p>` : ""}
          <p>${escapeHtml(msgEn)}</p>
          <p>We did not receive подтвержд the funds for this request. Please verify details or contact support.</p>
        `,
      });
    }

    return NextResponse.json({ success: true, status: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
