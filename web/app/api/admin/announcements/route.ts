import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: announcements, error: announcementsError } = await supabase
    .from("announcements")
    .select("id, title, content, title_ur, content_ur, language, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (announcementsError) {
    return NextResponse.json({ error: announcementsError.message }, { status: 500 });
  }

  return NextResponse.json({ announcements: announcements ?? [] });
}

export async function POST(request: Request) {
  const { error, user: adminUser } = await requireAdmin();
  if (error) return error;

  let body: {
    title?: string;
    content?: string;
    title_ur?: string;
    content_ur?: string;
    action?: "publish" | "delete";
    id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  if (body.action === "delete") {
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const { error: deleteError } = await supabase
      .from("announcements")
      .delete()
      .eq("id", body.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Publish
  if (!body.title || !body.content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabase.from("announcements").insert({
    title: body.title,
    content: body.content,
    title_ur: body.title_ur ?? null,
    content_ur: body.content_ur ?? null,
    language: "en",
    created_by: adminUser?.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}