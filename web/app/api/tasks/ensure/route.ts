import { NextResponse } from "next/server";
import { ensureAndLoadTasks } from "@/lib/tasks";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Verify the authenticated user matches the user_id being operated on.
  if (user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await ensureAndLoadTasks(userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tasks" },
      { status: 500 }
    );
  }
}