import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { user_id, message, language } = body as {
    user_id: string;
    message: string;
    language?: string;
  };

  if (!user_id || !message) {
    return NextResponse.json({ error: "user_id and message required" }, { status: 400 });
  }

  // 1. Save user message
  const userMsg: Record<string, unknown> = {
    user_id,
    message,
    message_ur: language === "ur" ? message : null,
    sender: "user",
  };
  const { error: insErr } = await supabaseAdmin.from("messages").insert(userMsg);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 2. Check admin online status
  const { data: setting } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "admin_chat_status")
    .single();

  const adminOnline = setting?.value === "online";

  // 3. If admin is online, just confirm — admin replies manually
  if (adminOnline) {
    const sysMsg = language === "ur"
      ? "ایڈمن فی الحال آن لائن ہے۔ وہ جلد آپ کو جواب دے گا۔"
      : "An admin is online and will reply shortly.";
    await supabaseAdmin.from("messages").insert({
      user_id,
      message: sysMsg,
      message_ur: language === "ur" ? sysMsg : null,
      sender: "system",
    });
    return NextResponse.json({ ok: true, mode: "admin_online", reply: sysMsg });
  }

  // 4. Admin offline → try Gemini AI
  try {
    const langPrompt = language === "ur"
      ? "You are TDX Investment support assistant. Reply ONLY in Urdu. Keep it short and helpful.\n\nUser question: "
      : "You are TDX Investment support assistant. Reply ONLY in English. Keep it short and helpful.\n\nUser question: ";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: langPrompt + message }] }],
        }),
      }
    );

    const data = await res.json();
    const aiReply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (aiReply) {
      const aiMsg: Record<string, unknown> = {
        user_id,
        message: aiReply,
        message_ur: language === "ur" ? aiReply : null,
        sender: "ai",
      };
      await supabaseAdmin.from("messages").insert(aiMsg);
      return NextResponse.json({ ok: true, mode: "ai", reply: aiReply });
    }
  } catch {
    // Gemini failed — fall through
  }

  // 5. AI failed → save system message, admin will reply later
  const fallbackMsg = language === "ur"
    ? "آپ کا پیغام محفوظ ہو گیا ہے۔ ایڈمن آن لائن ہونے پر جواب دے گا۔"
    : "Your message has been saved. The admin will reply when online.";
  await supabaseAdmin.from("messages").insert({
    user_id,
    message: fallbackMsg,
    message_ur: language === "ur" ? fallbackMsg : null,
    sender: "system",
  });
  return NextResponse.json({ ok: true, mode: "queued", reply: fallbackMsg });
}