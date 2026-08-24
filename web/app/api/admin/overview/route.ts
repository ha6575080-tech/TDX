import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET — notification log
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbErr } = await supabaseAdmin
    .from("notifications")
    .select("id, title, title_ur, message, message_ur, user_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ notifications: data });
}

// POST — send notification (broadcast or targeted)
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { title, title_ur, message, message_ur, target, user_id } = body as {
    title: string;
    title_ur?: string;
    message: string;
    message_ur?: string;
    target: "all" | "specific";
    user_id?: string;
  };

  if (!title || !message) {
    return NextResponse.json({ error: "title and message required" }, { status: 400 });
  }

  if (target === "specific" && user_id) {
    // Send to one user
    const { error: insErr } = await supabaseAdmin.from("notifications").insert({
      user_id,
      title,
      title_ur: title_ur || null,
      message,
      message_ur: message_ur || null,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Trigger web push
    await sendWebPush(user_id, title, message);

    return NextResponse.json({ ok: true, sent: "specific" });
  }

  // target = "all" — insert for every active user + one global row
  const { data: users } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("status", "active");

  const rows = [
    // Global row (for future users)
    {
      user_id: null,
      title,
      title_ur: title_ur || null,
      message,
      message_ur: message_ur || null,
    },
    // One row per active user
    ...((users || []).map((u) => ({
      user_id: u.id,
      title,
      title_ur: title_ur || null,
      message,
      message_ur: message_ur || null,
    }))),
  ];

  const { error: insErr } = await supabaseAdmin.from("notifications").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Web push to all active users
  if (users) {
    for (const u of users) {
      await sendWebPush(u.id, title, message);
    }
  }

  return NextResponse.json({ ok: true, sent: "all", count: rows.length });
}

// Helper: send web push to one user
async function sendWebPush(userId: string, title: string, body: string) {
  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:ha6575080@gmail.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) return;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: "/dashboard" })
        );
      } catch {
        // Subscription expired or invalid — silently skip
      }
    }
  } catch {
    // web-push not configured or VAPID keys missing — silently skip
  }
}
