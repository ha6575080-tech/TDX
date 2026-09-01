import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPushToSubscriptions } from "@/lib/push";
import { internalError } from "@/lib/api-errors";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, user_id, title, message, title_ur, message_ur, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (notificationsError) {
    return internalError("admin/notifications", notificationsError);
  }

  // Group by batch: same created_at within 1 second = same batch.
  const batches: {
    id: string;
    title: string;
    message: string;
    target: string;
    created_at: string;
    read_count: number;
    total_count: number;
  }[] = [];

  for (const n of notifications ?? []) {
    const batchTime = new Date(n.created_at).getTime();
    const existing = batches.find(
      (b) => Math.abs(new Date(b.created_at).getTime() - batchTime) < 1000
    );
    if (existing) {
      existing.total_count += 1;
      if (n.is_read) existing.read_count += 1;
    } else {
      batches.push({
        id: n.id,
        title: n.title,
        message: n.message,
        target: n.user_id ? "specific" : "all",
        created_at: n.created_at,
        read_count: n.is_read ? 1 : 0,
        total_count: 1,
      });
    }
  }

  return NextResponse.json({ notifications: batches });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: {
    title?: string;
    title_ur?: string;
    message?: string;
    message_ur?: string;
    target?: "all" | "specific";
    user_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, title_ur, message, message_ur, target, user_id } = body;
  if (!title || !message) {
    return NextResponse.json(
      { error: "title and message are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();
  const now = new Date().toISOString();

  // Duplicate-broadcast guard: reject an identical notification (same title,
  // message, and target) re-submitted within 60 seconds (double-click or
  // network retry). "all" is detected via the global marker row (user_id IS
  // NULL); any non-"all" target is treated as specific and requires user_id
  // (same rule the insert path below enforces).
  if (target !== "all" && !user_id) {
    return NextResponse.json(
      { error: "user_id is required when target is specific" },
      { status: 400 }
    );
  }
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const duplicateQuery = supabase
    .from("notifications")
    .select("id")
    .eq("title", title)
    .eq("message", message)
    .gte("created_at", sixtySecondsAgo)
    .limit(1);
  const { data: recentDuplicate, error: duplicateError } =
    target === "all"
      ? await duplicateQuery.is("user_id", null)
      : await duplicateQuery.eq("user_id", user_id as string);
  if (duplicateError) return internalError("admin/notifications", duplicateError);
  if (recentDuplicate && recentDuplicate.length > 0) {
    return NextResponse.json(
      {
        error:
          "This exact notification was just sent. Please wait a minute before resending.",
      },
      { status: 409 }
    );
  }

  if (target === "all") {
    // Insert a row for EVERY active user PLUS one global row (user_id=null).
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true);

    const rows = (profiles ?? []).map((p: any) => ({
      user_id: p.id,
      title,
      message,
      title_ur: title_ur ?? null,
      message_ur: message_ur ?? null,
      is_read: false,
      created_at: now,
    }));

    // Global row for future users.
    rows.push({
      user_id: null,
      title,
      message,
      title_ur: title_ur ?? null,
      message_ur: message_ur ?? null,
      is_read: false,
      created_at: now,
    });

    const { error: insertError } = await supabase.from("notifications").insert(rows);
    if (insertError) {
      return internalError("admin/notifications", insertError);
    }

    // Trigger web push to all users.
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    const payload = JSON.stringify({ title, body: message, url: "/" });
    await sendPushToSubscriptions(subs ?? [], payload);

    return NextResponse.json({ success: true, target: "all" });
  }

  // target === "specific"
  if (!user_id) {
    return NextResponse.json(
      { error: "user_id is required when target is specific" },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabase.from("notifications").insert({
    user_id,
    title,
    message,
    title_ur: title_ur ?? null,
    message_ur: message_ur ?? null,
    is_read: false,
    created_at: now,
  });
  if (insertError) {
    return internalError("admin/notifications", insertError);
  }

  // Trigger web push to that user.
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);
  const payload = JSON.stringify({ title, body: message, url: "/" });
  await sendPushToSubscriptions(subs ?? [], payload);

  return NextResponse.json({ success: true, target: "specific" });
}