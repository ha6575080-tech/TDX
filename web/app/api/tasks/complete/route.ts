import { readJsonObject, isOwnedObjectPath } from "@/lib/request-validation";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";
import { pickRandomLinks } from "@/lib/youtube-links";

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { taskId?: string; userId?: string; path?: string };
  try {
    body = await readJsonObject(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, userId, path } = body;
  if (typeof taskId !== "string" || !taskId || typeof userId !== "string" || !userId || !path) {
    return NextResponse.json(
      { error: "taskId, userId and path are required" },
      { status: 400 }
    );
  }

  // Verify the authenticated user matches the user_id being operated on.
  if (user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The evidence file must live inside this member's own storage folder and
  // must be EXACTLY "<userId>/<filename>" — one segment only. This blocks a
  // forged path that could point admin signed-URL views at another member's
  // private object, path traversal ("../", nested segments), backslash
  // separators, and empty/odd segment names. (Uploads are independently
  // owner-scoped by storage RLS.)
  if (!isOwnedObjectPath(path, userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rel = path.slice(userId.length + 1);
  if (!rel || rel === "." || rel === ".." || rel.includes("/") || rel.includes("\\")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceRoleClient();

  const { data: result, error: rpcError } = await supabase.rpc("complete_member_task", {
    p_user: user.id, p_task: taskId, p_path: path, p_links: pickRandomLinks(5),
  });
  if (rpcError) return internalError("tasks/complete", rpcError);
  if (!result?.ok) {
    const reason = result?.reason;
    const status = reason === "account_suspended" ? 403 : reason === "task_not_found" ? 404 : 400;
    return NextResponse.json({ error: reason === "invalid_evidence" ? "Upload your task screenshot before completing the task." : "Could not complete this task." }, { status });
  }
  return NextResponse.json({ success: true, screenshot_url: result.screenshot_url });
}
