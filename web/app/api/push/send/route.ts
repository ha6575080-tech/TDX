import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPushToSubscriptions } from "@/lib/push";

/**
 * POST /api/push/send
 *
 * Targeted push: a user may only send to themselves (userId must match the
 * session). Broadcast (`all: true`) is admin-only.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: {
    userId?: string;
    all?: boolean;
    title?: string;
    body?: string;
    url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, all, title, body: msgBody, url } = body;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  const payload = JSON.stringify({
    title: title ?? "TDX",
    body: msgBody ?? "",
    url: url ?? "/",
  });

  // Broadcast — admin only.
  if (all === true) {
    const adminErr = await requireAdmin();
    if (adminErr.error) return adminErr.error;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    const { sent } = await sendPushToSubscriptions(subs ?? [], payload);
    return NextResponse.json({ success: true, sent });
  }

  // Targeted — the authenticated user may only send to themselves.
  if (!userId) {
    return NextResponse.json(
      { error: "userId or all is required" },
      { status: 400 }
    );
  }
  if (user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const { sent } = await sendPushToSubscriptions(subs ?? [], payload);
  return NextResponse.json({ success: true, sent });
}