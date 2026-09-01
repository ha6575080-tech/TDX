import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerError, logServerWarn } from "@/lib/api-errors";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find deposits with payouts due in next 24 hours.
  // NOTE: no profiles(...) embed — deposits has TWO foreign keys to profiles
  // (user_id and created_by_agent), so PostgREST cannot infer the relationship.
  // Profiles are fetched explicitly below using each trusted deposit.user_id.
  const { data: dueDeposits, error } = await supabaseAdmin
    .from("deposits")
    .select(
      "id, user_id, amount, next_payout_date, monthly_profit_pct"
    )
    .eq("status", "approved")
    .not("next_payout_date", "is", null)
    .gte("next_payout_date", now.toISOString())
    // Exclusive upper bound: a payout due exactly at the boundary must not
    // match two consecutive daily runs.
    .lt("next_payout_date", tomorrow.toISOString());

  if (error) return internalError("cron/payout-reminders", error);
  if (!dueDeposits || dueDeposits.length === 0) {
    return NextResponse.json({ ok: true, due: 0 });
  }

  // Daily idempotency guard: the cron runs once per day, but retries
  // (Vercel retry, manual re-run, overlapping executions) previously sent a
  // duplicate admin email + in-app reminder for the same payouts. Skip the
  // entire run if a reminder for today (UTC) already exists.
  const dayStartUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const { data: existingReminder, error: reminderCheckError } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("title", "Payout Reminder")
    .gte("created_at", dayStartUtc)
    .limit(1);
  if (reminderCheckError) return internalError("cron/payout-reminders", reminderCheckError);
  if (existingReminder && existingReminder.length > 0) {
    return NextResponse.json({
      ok: true,
      due: dueDeposits.length,
      skipped: "reminder_already_sent_today",
    });
  }

  // Batch-fetch profiles by trusted deposit.user_id (1 query, no N+1)
  const userIds = [...new Set(dueDeposits.map((d: any) => d.user_id))];
  const profileMap = new Map<string, { full_name: string | null; mobile_number: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, mobile_number")
      .in("id", userIds);
    if (profileError) return internalError("cron/payout-reminders", profileError);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, mobile_number: p.mobile_number });
    }
  }

  // Build email content
  const rows = dueDeposits.map((d: Record<string, unknown>) => {
    const profile = profileMap.get(d.user_id as string) ?? { full_name: null, mobile_number: null };
    const pct = (d.monthly_profit_pct as number) || 8;
    const payout = ((d.amount as number) * (pct as number)) / 100;
    const dueDate = new Date(d.next_payout_date as string).toLocaleDateString();
    return `• ${escapeHtml((profile.full_name as string) ?? "N/A")} (${escapeHtml((profile.mobile_number as string) ?? "N/A")}) — Rs ${d.amount} @ ${pct}% = Rs ${payout} — Due: ${dueDate}`;
  });

  const html = `
    <h2>💰 TDX Payout Reminder</h2>
    <p><strong>${dueDeposits.length} payout(s) due in the next 24 hours:</strong></p>
    <ul>${rows.map((r: string) => `<li>${r}</li>`).join("")}</ul>
    <p>Log in to the Admin Panel → Payouts tab to process these.</p>
  `;

  // Send email to admin
  try {
    await transporter.sendMail({
      from: `"TDX System" <${process.env.SMTP_USER}>`,
      to: "ha6575080@gmail.com",
      subject: `⏰ TDX Payout Reminder — ${dueDeposits.length} payout(s) due`,
      html,
    });
  } catch (e) {
    logServerError("cron/payout-reminders", e, "email failed");
  }

  // Also insert in-app notification for admin
  const { data: adminProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single();

  if (adminProfile) {
    const { error: reminderInsertError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: adminProfile.id,
        title: "Payout Reminder",
        title_ur: "ادائیگی یاد دہانی",
        message: `${dueDeposits.length} payout(s) due. Review in Admin Panel.`,
        message_ur: `${dueDeposits.length} ادائیگیاں واجب ہیں۔ ایڈمن پینل میں دیکھیں۔`,
      });
    if (reminderInsertError) {
      // The reminder email already went out; make the in-app insert failure
      // visible to operators instead of silently dropping it.
      logServerWarn(
        "cron/payout-reminders",
        reminderInsertError,
        "in-app reminder insert failed"
      );
    }
  }

  return NextResponse.json({ ok: true, due: dueDeposits.length, rows });
}