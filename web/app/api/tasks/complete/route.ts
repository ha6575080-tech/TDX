import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { taskId?: string; userId?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, userId, path } = body;
  if (!taskId || !userId || !path) {
    return NextResponse.json(
      { error: "taskId, userId and path are required" },
      { status: 400 }
    );
  }

  // Verify the authenticated user matches the user_id being operated on.
  if (user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceRoleClient();

  // Verify the task belongs to this user.
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, user_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message ?? "Task not found" },
      { status: 404 }
    );
  }

  // PRIVATE bucket: store the Storage OBJECT PATH (not a permanent public URL —
  // a getPublicUrl() link would be dead for a private bucket). Authorized
  // viewers generate short-lived signed URLs from this path on demand:
  //   owner  → storage RLS (view own task screenshot) + session-signed URL
  //   admin  → POST /api/admin/receipt (allowlisted for task-screenshots)
  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      screenshot_url: path,
    })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, screenshot_url: path });
}