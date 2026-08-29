import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  // Notifications for this user OR global broadcasts (user_id IS NULL).
  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, title, message, title_ur, message_ur, is_read, created_at")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (notificationsError) {
    return NextResponse.json({ error: notificationsError.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: notifications ?? [] });
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
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  const { notification_id } = body;

  // Mark as read only if it belongs to this user OR is a global broadcast.
  const { error: updateError } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notification_id)
    .or(`user_id.eq.${user.id},user_id.is.null`);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}