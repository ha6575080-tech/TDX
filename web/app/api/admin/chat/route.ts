import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  const supabase = await createServiceRoleClient();

  // If a specific user is selected, return their full thread.
  if (userId) {
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, sender, message, message_ur, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return internalError("admin/chat", messagesError);
    }

    return NextResponse.json({ messages: messages ?? [] });
  }

  // Otherwise list users who have messages with last message + unread count.
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("user_id, sender, message, is_read, created_at")
    .order("created_at", { ascending: false });

  if (messagesError) {
    return internalError("admin/chat", messagesError);
  }

  const byUser = new Map<
    string,
    { lastMessage: string; lastAt: string; unread: number }
  >();
  for (const m of messages ?? []) {
    const cur = byUser.get(m.user_id);
    if (!cur) {
      byUser.set(m.user_id, {
        lastMessage: m.message ?? "",
        lastAt: m.created_at ?? "",
        unread: m.sender !== "admin" && !m.is_read ? 1 : 0,
      });
    } else {
      if (!cur.lastAt || m.created_at > cur.lastAt) {
        cur.lastMessage = m.message ?? "";
        cur.lastAt = m.created_at ?? "";
      }
      if (m.sender !== "admin" && !m.is_read) {
        cur.unread += 1;
      }
    }
  }

  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, mobile_number")
    .in("id", userIds);

  const users = (profiles ?? []).map((p: any) => ({
    id: p.id,
    fullName: p.full_name ?? "Unknown",
    username: p.username ?? "Unknown",
    mobile: p.mobile_number ?? "Unknown",
    ...(byUser.get(p.id) ?? { lastMessage: "", lastAt: "", unread: 0 }),
  }));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { userId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, text } = body;
  if (!userId || !text || !text.trim()) {
    return NextResponse.json(
      { error: "userId and text are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { error: insertError } = await supabase.from("messages").insert({
    user_id: userId,
    sender: "admin",
    message: text.trim(),
    message_ur: text.trim(),
    is_read: false,
  });

  if (insertError) {
    return internalError("admin/chat", insertError);
  }

  return NextResponse.json({ success: true });
}