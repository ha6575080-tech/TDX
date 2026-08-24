import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PLACEHOLDER_SECRETS = new Set([
  "",
  "your-random-secret-here",
  "your-cron-secret",
  "changeme",
]);

export async function GET(req: Request) {
  // Verify cron secret — fail CLOSED when the secret is missing or a
  // placeholder, so the endpoint is never publicly invocable.
  const secret = process.env.CRON_SECRET ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  if (PLACEHOLDER_SECRETS.has(secret) || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find unread notifications
  const { data: notifs } = await supabaseAdmin
    .from("notifications")
    .select("id, title, message, user_id")
    .eq("is_read", false)
    .not("user_id", "is", null)
    .limit(100);

  if (!notifs || notifs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:ha6575080@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  let sent = 0;
  for (const n of notifs) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", n.user_id);

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: n.title, body: n.message, url: "/dashboard" })
        );
        sent++;
      } catch {}
    }
  }

  return NextResponse.json({ ok: true, sent });
}