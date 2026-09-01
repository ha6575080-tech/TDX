import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  // Notifications for this user OR global broadcasts (user_id IS NULL).
  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, title, message, title_ur, message_ur, is_read, created_at, user_id")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (notificationsError) {
    return internalError("notifications", notificationsError);
  }

  const rows = notifications ?? [];

  // Global broadcast rows (user_id IS NULL) are SHARED catalog rows — their
  // is_read column must never be mutated by a member. Per-user read state
  // for them lives in notification_reads, so each member's read state is
  // independent. Own rows keep their direct is_read column.
  const globalIds = rows
    .filter((n: { user_id: string | null }) => n.user_id === null)
    .map((n: { id: string }) => n.id);
  const globalReadIds = new Set<string>();
  if (globalIds.length > 0) {
    const { data: reads, error: readsError } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_id", user.id)
      .in("notification_id", globalIds);
    if (readsError) {
      return internalError("notifications", readsError);
    }
    for (const r of reads ?? []) {
      globalReadIds.add(r.notification_id as string);
    }
  }

  return NextResponse.json({
    notifications: rows.map((n) => ({
      ...n,
      is_read: n.user_id === null ? globalReadIds.has(n.id) : n.is_read,
    })),
  });
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { notification_id?: string; mark_all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Bulk: mark ALL of this user's notifications as read in ONE request.
  if (body.mark_all === true) {
    // Own rows only — scoped strictly to this user.
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (updateError) {
      return internalError("notifications", updateError);
    }

    // Global broadcast rows are shared and immutable for members — record
    // per-user read state instead (same latest-50 window the GET returns;
    // duplicates are ignored via upsert).
    const { data: globalRows, error: globalError } = await supabase
      .from("notifications")
      .select("id")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (globalError) {
      return internalError("notifications", globalError);
    }
    if (globalRows && globalRows.length > 0) {
      const { error: readsError } = await supabase
        .from("notification_reads")
        .upsert(
          globalRows.map((g: { id: string }) => ({
            notification_id: g.id,
            user_id: user.id,
          })),
          { onConflict: "notification_id,user_id", ignoreDuplicates: true }
        );
      if (readsError) {
        return internalError("notifications", readsError);
      }
    }

    return NextResponse.json({ success: true });
  }

  const { notification_id } = body;
  if (!notification_id || typeof notification_id !== "string") {
    return NextResponse.json(
      { error: "notification_id is required" },
      { status: 400 }
    );
  }

  // Fetch the target scoped to this user OR global, then branch:
  //   own row    -> update is_read directly (owner-scoped).
  //   global row -> record per-user read state; the SHARED row's is_read
  //                 column is NEVER written by a member.
  const { data: target, error: targetError } = await supabase
    .from("notifications")
    .select("id, user_id")
    .eq("id", notification_id)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .limit(1)
    .maybeSingle();
  if (targetError) {
    return internalError("notifications", targetError);
  }
  if (!target) {
    // Unknown id or another user's row — matches nothing, affects no one.
    // (Preserves the previous no-op success behavior.)
    return NextResponse.json({ success: true });
  }

  if (target.user_id === null) {
    const { error: readsError } = await supabase
      .from("notification_reads")
      .upsert(
        { notification_id: target.id, user_id: user.id },
        { onConflict: "notification_id,user_id", ignoreDuplicates: true }
      );
    if (readsError) {
      return internalError("notifications", readsError);
    }
    return NextResponse.json({ success: true });
  }

  const { error: updateError } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", target.id)
    .eq("user_id", user.id);
  if (updateError) {
    return internalError("notifications", updateError);
  }

  return NextResponse.json({ success: true });
}