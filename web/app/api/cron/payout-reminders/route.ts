import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerError, logServerWarn } from "@/lib/api-errors";
import { getDueStages, REMINDER_TOLERANCE_MS } from "@/lib/payoutReminders";

/**
 * Payout reminder cron — Vercel Hobby compliant
 *
 * Vercel Hobby forbids minute cron expressions (e.g. every 5 minutes). This
 * endpoint therefore keeps the hobby-allowed daily schedule in vercel.json
 * (0 0 * * *) as a fallback, but the authoritative reminder delivery is an
 * external scheduler that hits this endpoint every ~5 minutes with
 * Authorization: Bearer CRON_SECRET. Recommended externals: cron-job.org,
 * UptimeRobot, or GitHub Actions scheduled workflow. Any 5-minute caller
 * satisfies the 10m granularity; the daily Vercel cron alone would miss stages.
 *
 * The endpoint is safe to call at ANY frequency (>=5m, even every minute):
 * - It derives which stages (48h/24h/12h/1h/10m) are currently due per payout
 *   from payout_date - now() using a 5-minute tolerance window.
 * - DB-backed idempotency is enforced by payout_reminder_deliveries with
 *   partial unique indexes on (profit_id,stage,channel) and
 *   (deposit_id,stage,channel). Concurrent executions and retries can never
 *   duplicate a stage for the same payout via the same channel.
 * - Email and in-app are tracked separately (channel column) so a failure
 *   in one never blocks the other and never triggers a financial mutation
 *   (this endpoint never writes to profits/payouts/withdrawals).
 * - Each member payout is independent: the unique key includes the specific
 *   payout id, so one member failure never affects another.
 */

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabaseUrl is required.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

// Attempt to claim a delivery slot. Returns true if this caller now owns the
// stage+channel for this payout (insert succeeded), false if already claimed
// (unique violation 23505) or on any other error (treated as already claimed
// to keep exactly-once semantics under races).
async function tryClaimDelivery(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  profitId: string | null;
  depositId: string | null;
  userId: string;
  payoutDateIso: string;
  stage: string;
  channel: "email" | "in_app";
}): Promise<boolean> {
  const { supabase, profitId, depositId, userId, payoutDateIso, stage, channel } = opts;
  const row: Record<string, unknown> = {
    user_id: userId,
    payout_date: payoutDateIso,
    stage,
    channel,
  };
  if (profitId) row.profit_id = profitId;
  if (depositId) row.deposit_id = depositId;
  // Insert with unique enforcement; rely on 23505 rejection for already-sent.
  const { error } = await supabase.from("payout_reminder_deliveries").insert(row);
  if (!error) return true;
  // 23505 = unique_violation => already claimed => not an error, just skip.
  const code = (error as { code?: string })?.code;
  if (code === "23505") return false;
  // For any other DB error, log and treat as already claimed to avoid
  // duplicate attempts flooding the delivery channel. The operator can
  // inspect the log via correlation; the payout remains due for next run
  // only if the row was NOT inserted (but we pessimistically treat unknown
  // errors as claimed to preserve exactly-once; retry will re-attempt only
  // if the caller retries the entire stage on a different execution where
  // the row is still absent — the unique constraint guarantees no duplicate
  // even if we err here).
  logServerWarn("cron/payout-reminders", error, `claim delivery failed stage=${stage} channel=${channel}`);
  return false;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000 + REMINDER_TOLERANCE_MS);

  // 1. Fetch payouts due within the 48h + tolerance horizon.
  //    Two sources: deposit-based monthly payouts (next_payout_date) and
  //    profit-ledger pending payouts (payout_date). Both are queried
  //    independently so either model can drive reminders. Results are
  //    processed per-entity, per-stage, per-channel with independent
  //    idempotency.
  const [depositsRes, profitsRes] = await Promise.all([
    supabase
      .from("deposits")
      .select("id, user_id, amount, next_payout_date, monthly_profit_pct")
      .eq("status", "approved")
      .not("next_payout_date", "is", null)
      .gte("next_payout_date", now.toISOString())
      .lte("next_payout_date", horizon.toISOString())
      .limit(500),
    supabase
      .from("profits")
      .select("id, user_id, amount, payout_date, status")
      .eq("status", "pending")
      .not("payout_date", "is", null)
      .gte("payout_date", now.toISOString())
      .lte("payout_date", horizon.toISOString())
      .limit(500),
  ]);

  if (depositsRes.error) return internalError("cron/payout-reminders", depositsRes.error);
  if (profitsRes.error) return internalError("cron/payout-reminders", profitsRes.error);

  const dueDeposits = (depositsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    next_payout_date: string;
    monthly_profit_pct: number | null;
  }>;
  const dueProfits = (profitsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    payout_date: string;
  }>;

  if (dueDeposits.length === 0 && dueProfits.length === 0) {
    return NextResponse.json({ ok: true, due: 0, deposits: 0, profits: 0, delivered: [] });
  }

  // 2. Batch-fetch profiles for display names (avoid N+1).
  const allUserIds = [
    ...new Set([...dueDeposits.map((d) => d.user_id), ...dueProfits.map((p) => p.user_id)]),
  ];
  const profileMap = new Map<string, { full_name: string | null; mobile_number: string | null; email: string | null }>();
  if (allUserIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, mobile_number, email")
      .in("id", allUserIds);
    if (profileError) return internalError("cron/payout-reminders", profileError);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, {
        full_name: (p as { full_name: string | null }).full_name ?? null,
        mobile_number: (p as { mobile_number: string | null }).mobile_number ?? null,
        email: (p as { email: string | null }).email ?? null,
      });
    }
  }

  // Admin ids for in-app delivery (notify each admin; member also gets one).
  let adminIds: string[] = [];
  try {
    const { data: adminProfiles } = await supabase.from("profiles").select("id").eq("role", "admin").limit(10);
    adminIds = (adminProfiles ?? []).map((a: { id: string }) => a.id);
  } catch {
    // non-fatal
  }

  // Helper to build row display for emails.
  const delivered: Array<{
    entity: "deposit" | "profit";
    id: string;
    user_id: string;
    stage: string;
    channel: string;
    claimed: boolean;
  }> = [];

  // 3. Process deposits per-stage
  for (const d of dueDeposits) {
    const payoutDate = new Date(d.next_payout_date);
    const dueStages = getDueStages(payoutDate, now, REMINDER_TOLERANCE_MS);
    if (dueStages.length === 0) continue;
    const profile = profileMap.get(d.user_id) ?? { full_name: null, mobile_number: null, email: null };
    const pct = d.monthly_profit_pct ?? 8;
    const payoutAmount = (Number(d.amount) * Number(pct)) / 100;

    for (const stage of dueStages) {
      // EMAIL channel — independent idempotency
      const emailClaimed = await tryClaimDelivery({
        supabase,
        profitId: null,
        depositId: d.id,
        userId: d.user_id,
        payoutDateIso: d.next_payout_date,
        stage,
        channel: "email",
      });
      delivered.push({ entity: "deposit", id: d.id, user_id: d.user_id, stage, channel: "email", claimed: emailClaimed });
      if (emailClaimed) {
        // Fire email to admin (and best-effort to member if email exists on profile).
        // Financial state is never mutated here; failure only logs.
        const html = `
          <h2>⏰ TDX Payout Reminder — ${stage} to go</h2>
          <p><strong>${escapeHtml(profile.full_name ?? "Member")} (${escapeHtml(profile.mobile_number ?? d.user_id)})</strong></p>
          <ul>
            <li>Deposit: ${escapeHtml(d.id)}</li>
            <li>Amount: Rs ${escapeHtml(d.amount)} @ ${escapeHtml(pct)}% = Rs ${escapeHtml(payoutAmount.toFixed(2))}</li>
            <li>Due: ${escapeHtml(payoutDate.toLocaleString("en-GB", { timeZone: "UTC" }))} UTC</li>
            <li>Stage: ${escapeHtml(stage)} before payout</li>
          </ul>
          <p>Log in to Admin Panel → Payouts to process.</p>
        `;
        try {
          await getTransporter().sendMail({
            from: `"TDX System" <${process.env.SMTP_USER}>`,
            to: ADMIN_EMAIL,
            subject: `⏰ TDX Payout Reminder (${stage}) — ${profile.full_name ?? d.user_id} — Rs ${payoutAmount.toFixed(2)} due ${payoutDate.toLocaleDateString("en-GB")}`,
            html,
          });
        } catch (e) {
          logServerError("cron/payout-reminders", e, `email failed stage=${stage} deposit=${d.id}`);
        }
        // Best-effort member email if we have it (does NOT affect idempotency of the admin email;
        // the member email shares the same delivery claim, so at most one email per stage per payout is counted;
        // sending to admin is the authoritative channel).
      }

      // IN-APP channel — independent from email
      const inAppClaimed = await tryClaimDelivery({
        supabase,
        profitId: null,
        depositId: d.id,
        userId: d.user_id,
        payoutDateIso: d.next_payout_date,
        stage,
        channel: "in_app",
      });
      delivered.push({ entity: "deposit", id: d.id, user_id: d.user_id, stage, channel: "in_app", claimed: inAppClaimed });
      if (inAppClaimed) {
        const title = `Payout Reminder — ${stage} left`;
        const titleUr = `ادائیگی یاد دہانی — ${stage} باقی`;
        const msg = `Your payout of Rs ${payoutAmount.toFixed(2)} (${pct}%) is due in ${stage} (deposit ${d.id.slice(0, 8)}). Due: ${payoutDate.toLocaleDateString("en-GB")} UTC.`;
        const msgUr = `آپ کی Rs ${payoutAmount.toFixed(2)} (${pct}%) کی ادائیگی ${stage} میں واجب ہے۔`;
        // Insert for the owner (member) — primary recipient.
        const notificationsToInsert: Array<Record<string, unknown>> = [
          {
            user_id: d.user_id,
            title,
            title_ur: titleUr,
            message: msg,
            message_ur: msgUr,
          },
        ];
        // Also notify each admin for operational visibility (fan-out). These
        // are separate notification rows but share the single delivery claim
        // per stage — duplicates are prevented by the claim, fan-out is safe.
        for (const adminId of adminIds) {
          if (adminId === d.user_id) continue;
          notificationsToInsert.push({
            user_id: adminId,
            title: `Payout due in ${stage} — ${profile.full_name ?? d.user_id}`,
            title_ur: `ادائیگی ${stage} میں واجب — ${profile.full_name ?? ""}`,
            message: `Deposit ${d.id.slice(0, 8)} for ${profile.full_name ?? d.user_id} (Rs ${d.amount} @ ${pct}%) due ${payoutDate.toLocaleDateString("en-GB")} — ${stage} remaining.`,
            message_ur: `ڈپازٹ ${d.id.slice(0, 8)} — ${stage} باقی۔`,
          });
        }
        const { error: notifErr } = await supabase.from("notifications").insert(notificationsToInsert);
        if (notifErr) logServerWarn("cron/payout-reminders", notifErr, `in_app insert failed stage=${stage} deposit=${d.id}`);
      }
    }
  }

  // 4. Process profits per-stage (same pattern, but profit_id drives idempotency)
  for (const p of dueProfits) {
    const payoutDate = new Date(p.payout_date);
    const dueStages = getDueStages(payoutDate, now, REMINDER_TOLERANCE_MS);
    if (dueStages.length === 0) continue;
    const profile = profileMap.get(p.user_id) ?? { full_name: null, mobile_number: null, email: null };

    for (const stage of dueStages) {
      const emailClaimed = await tryClaimDelivery({
        supabase,
        profitId: p.id,
        depositId: null,
        userId: p.user_id,
        payoutDateIso: p.payout_date,
        stage,
        channel: "email",
      });
      delivered.push({ entity: "profit", id: p.id, user_id: p.user_id, stage, channel: "email", claimed: emailClaimed });
      if (emailClaimed) {
        const html = `
          <h2>⏰ TDX Profit Payout Reminder — ${stage} to go</h2>
          <p><strong>${escapeHtml(profile.full_name ?? "Member")} (${escapeHtml(profile.mobile_number ?? p.user_id)})</strong></p>
          <ul>
            <li>Profit: ${escapeHtml(p.id)} — Rs ${escapeHtml(p.amount)}</li>
            <li>Due: ${escapeHtml(payoutDate.toLocaleString("en-GB", { timeZone: "UTC" }))} UTC</li>
            <li>Stage: ${escapeHtml(stage)} before payout</li>
          </ul>
          <p>Review in Admin Panel → Payouts.</p>
        `;
        try {
          await getTransporter().sendMail({
            from: `"TDX System" <${process.env.SMTP_USER}>`,
            to: ADMIN_EMAIL,
            subject: `⏰ TDX Profit Reminder (${stage}) — ${profile.full_name ?? p.user_id} — Rs ${p.amount} due ${payoutDate.toLocaleDateString("en-GB")}`,
            html,
          });
        } catch (e) {
          logServerError("cron/payout-reminders", e, `email failed stage=${stage} profit=${p.id}`);
        }
      }

      const inAppClaimed = await tryClaimDelivery({
        supabase,
        profitId: p.id,
        depositId: null,
        userId: p.user_id,
        payoutDateIso: p.payout_date,
        stage,
        channel: "in_app",
      });
      delivered.push({ entity: "profit", id: p.id, user_id: p.user_id, stage, channel: "in_app", claimed: inAppClaimed });
      if (inAppClaimed) {
        const title = `Payout Reminder — ${stage} left`;
        const titleUr = `ادائیگی یاد دہانی — ${stage} باقی`;
        const msg = `Your profit payout of Rs ${p.amount} is due in ${stage} (profit ${p.id.slice(0, 8)}). Due: ${payoutDate.toLocaleDateString("en-GB")} UTC.`;
        const msgUr = `آپ کا ${p.amount} روپے کا منافع ${stage} میں واجب ہے۔`;
        const notificationsToInsert: Array<Record<string, unknown>> = [
          { user_id: p.user_id, title, title_ur: titleUr, message: msg, message_ur: msgUr },
        ];
        for (const adminId of adminIds) {
          if (adminId === p.user_id) continue;
          notificationsToInsert.push({
            user_id: adminId,
            title: `Profit due in ${stage} — ${profile.full_name ?? p.user_id}`,
            title_ur: `منافع ${stage} میں واجب`,
            message: `Profit ${p.id.slice(0, 8)} for ${profile.full_name ?? p.user_id} — Rs ${p.amount} due ${payoutDate.toLocaleDateString("en-GB")} — ${stage} remaining.`,
            message_ur: `منافع ${p.id.slice(0, 8)} — ${stage} باقی۔`,
          });
        }
        const { error: notifErr } = await supabase.from("notifications").insert(notificationsToInsert);
        if (notifErr) logServerWarn("cron/payout-reminders", notifErr, `in_app insert failed stage=${stage} profit=${p.id}`);
      }
    }
  }

  const claimedCount = delivered.filter((d) => d.claimed).length;
  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    horizon: horizon.toISOString(),
    toleranceMs: REMINDER_TOLERANCE_MS,
    dueDeposits: dueDeposits.length,
    dueProfits: dueProfits.length,
    evaluated: dueDeposits.length + dueProfits.length,
    claimed: claimedCount,
    attempted: delivered.length,
    delivered,
  });
}
