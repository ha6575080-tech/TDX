import { relatedOne } from "@/lib/relations";
import { readJsonObject, isUuid } from "@/lib/request-validation";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerWarn } from "@/lib/api-errors";

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

  const userIds = [...new Set((deposits ?? []).map((d) => d.user_id))];
  const profileMap = new Map<string, { full_name: string | null; username: string | null; mobile_number: string | null; email: string | null }>();
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

  const parsed = (deposits ?? []).map((d) => {
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
      packageName: relatedOne(d.packages)?.package_name ?? "Investment",
      monthlyReturnPercent: relatedOne(d.packages)?.monthly_return_percent ?? 0,
    };
  });

  return NextResponse.json({ deposits: parsed });
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  let body: { depositId?: unknown; action?: unknown; admin_notes?: unknown; reason?: unknown };
  try { body = await readJsonObject(request); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const notes = body.admin_notes ?? body.reason ?? null;
  if (!isUuid(body.depositId) || (body.action !== "approve" && body.action !== "reject") || (notes !== null && (typeof notes !== "string" || notes.length > 500))) return NextResponse.json({ error: "A valid deposit, action and optional note are required." }, { status: 400 });
  const client = await createServiceRoleClient();
  const { data, error: decisionError } = await client.rpc("admin_decide_deposit", { p_deposit: body.depositId, p_actor: user.id, p_action: body.action, p_notes: notes });
  if (decisionError) return internalError("admin/deposits", decisionError);
  if (!data?.ok) return NextResponse.json({ error: data?.reason === "already_processed" ? "Deposit was already processed. Refresh to see its current status." : "Deposit could not be processed." }, { status: data?.reason === "not_found" ? 404 : data?.reason === "forbidden" ? 403 : 409 });
  // Core state, audit and member inbox are already committed together.
  // An external email problem must not report a failed financial decision.
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const { data: member } = await client.from("profiles").select("email,full_name").eq("id", data.user_id).single();
      if (member?.email) {
        const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
        await transporter.sendMail({ from: process.env.SMTP_USER, to: member.email, subject: `TDX Deposit ${data.status}`, text: data.message, html: `<p>${escapeHtml(data.message)}</p>` });
      }
    } catch (err) { logServerWarn("admin/deposits", err, "Decision saved; email delivery failed"); }
  }
  return NextResponse.json({ success: true, status: data.status, cycleStart: data.cycle_start });
}
