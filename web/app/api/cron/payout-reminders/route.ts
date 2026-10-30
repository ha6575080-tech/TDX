import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { internalError, logServerError } from "@/lib/api-errors";

export const maxDuration = 60;
function mailTransport() {
  return process.env.SMTP_USER && process.env.SMTP_PASS ? nodemailer.createTransport({ service: "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 }) : null;
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return internalError("cron/payout-reminders", new Error("Reminder service is not configured"));
  if (new URL(request.url).searchParams.get("check") === "email") {
    const transport = mailTransport();
    try {
      if (!transport) throw new Error("Email is not configured");
      await transport.verify();
      return NextResponse.json({ ok: true, email_connection: "verified" });
    } catch (error) {
      logServerError("cron/payout-reminders/verify", error);
      return NextResponse.json({ ok: false, error: "Email connection check failed" }, { status: 503 });
    } finally { transport?.close(); }
  }
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const queued = await client.rpc("queue_payout_reminders");
  if (queued.error) return internalError("cron/payout-reminders/queue", queued.error);
  const claimed = await client.rpc("claim_payout_reminder_emails", { p_limit: 5 });
  if (claimed.error) return internalError("cron/payout-reminders/claim", claimed.error);
  const jobs = (claimed.data ?? []) as Array<{ id: string; claim_token: string; member_name: string; cycle_end: string; stage: string }>;
  let delivered = 0, failed = 0;
  const transporter = mailTransport();
  try {
    await Promise.all(jobs.map(async (job) => {
      let success = false;
      try {
        if (!transporter) throw new Error("Email is not configured");
        const due = new Date(job.cycle_end).toLocaleString("en-GB", { timeZone: "Asia/Karachi" });
        const result = await transporter.sendMail({ from: `"TDX System" <${process.env.SMTP_USER}>`, to: process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com", subject: "TDX monthly profit reminder", messageId: `<tdx-reminder-${job.id}@tdx-plum.vercel.app>`, text: `${job.member_name}: monthly profit cycle ends on ${due} PKT. Review monthly withdrawals in TDX. The payout rate is selected by the administrator when completing the payment.` });
        if (!result.accepted?.length) throw new Error("Email was not accepted");
        success = true;
      } catch (error) { logServerError("cron/payout-reminders/email", error); }
      const ack = await client.rpc("finish_payout_reminder_email", { p_id: job.id, p_token: job.claim_token, p_success: success });
      if (ack.error || !ack.data) { logServerError("cron/payout-reminders/ack", ack.error ?? new Error("Reminder lease expired")); failed++; }
      else if (success) delivered++; else failed++;
    }));
  } finally { transporter?.close(); }
  const healthy = failed === 0 && !queued.data?.in_app_failed && !Number(queued.data?.exhausted);
  return NextResponse.json({ ok: healthy, ...queued.data, email_delivered: delivered, email_failed: failed }, { status: healthy ? 200 : 503 });
}
