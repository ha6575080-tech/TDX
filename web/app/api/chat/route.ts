import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: Request) {
  // Authentication: the session user may only read their own thread.
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = user!.id;

  const { data, error: qErr } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: "failed to load messages" }, { status: 500 });
  }
  return NextResponse.json({ messages: data });
}

export async function POST(req: Request) {
  // Authentication: reject callers whose user_id doesn't match their session.
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { user_id?: string; message?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const { user_id, message, language } = body;

  // Language selection: "en" (default) | "ur" | "sd".
  const lang = language === "ur" || language === "sd" ? language : "en";
  // Localized helper for system-facing strings (never user-generated content).
  const sysText = (en: string, ur: string, sd: string) =>
    lang === "ur" ? ur : lang === "sd" ? sd : en;

  // Allow the authenticated user id to be omitted (the server derives it),
  // but it must match if provided.
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // user_id in the request must match the authenticated user's id.
  if (user_id && user_id !== user!.id) {
    return NextResponse.json(
      { error: "user_id does not match authenticated user" },
      { status: 403 }
    );
  }
  const userId = user!.id;

  // 1. Save user message (always keyed to the authenticated user's id).
  const userMsg: Record<string, unknown> = {
    user_id: userId,
    message,
    message_ur: language === "ur" ? message : null,
    sender: "user",
  };
  const { error: insErr } = await supabaseAdmin.from("messages").insert(userMsg);
  if (insErr) {
    return NextResponse.json(
      { error: "failed to save your message" },
      { status: 500 }
    );
  }

  // 2. Check admin online status.
  // Use maybeSingle(): if no row exists (or the lookup fails), default to
  // admin-offline and continue to the AI/queue path. This does NOT insert or
  // invent configuration data to mask an error.
  const { data: setting, error: settingsErr } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "admin_chat_status")
    .maybeSingle();

  const adminOnline = !settingsErr && setting?.value === "online";

  // 3. If admin is online, just confirm — admin replies manually.
  if (adminOnline) {
    const sysMsg = sysText(
      "An admin is online and will reply shortly.",
      "ایڈمن فی الحال آن لائن ہے۔ وہ جلد آپ کو جواب دے گا۔",
      "ايڊمن في الحال آن لائن آهي. هو جلد توهان کي جواب ڏيندو."
    );
    // Best-effort system message — the user prompt is already saved above, so
    // a failure here should not block the response.
    try {
      await supabaseAdmin.from("messages").insert({
        user_id,
        message: sysMsg,
        message_ur: language === "ur" ? sysMsg : null,
        sender: "system",
      });
    } catch {
      // ignore — best-effort
    }
    return NextResponse.json({ ok: true, mode: "admin_online", reply: sysMsg });
  }

  // 4. Admin offline → try Gemini AI (with a hard timeout so the frontend is
  // never left waiting indefinitely if the provider stalls).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Reply language follows the user's selection. The model must understand
    // the question in any of the supported forms (English, Urdu, Roman Urdu,
    // Sindhi, Roman Sindhi) but answer strictly in the selected language.
    // For Sindhi: natural سنڌي in the Sindhi Arabic script — never Urdu.
    const langPrompt =
      lang === "ur"
        ? "You are TDX Investment support assistant. Reply ONLY in Urdu. Understand the user's question even if it is written in English, Urdu, Roman Urdu, Sindhi, or Roman Sindhi. Keep it short and helpful.\n\nUser question: "
        : lang === "sd"
        ? "You are TDX Investment support assistant. Reply ONLY in Sindhi (سنڌي), written in the Sindhi Arabic script. Never reply in Urdu or English — the reply must be natural Sindhi, not Urdu. Understand the user's question even if it is written in English, Urdu, Roman Urdu, Sindhi, or Roman Sindhi. Keep it short and helpful.\n\nUser question: "
        : "You are TDX Investment support assistant. Reply ONLY in English. Understand the user's question even if it is written in English, Urdu, Roman Urdu, Sindhi, or Roman Sindhi. Keep it short and helpful.\n\nUser question: ";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: langPrompt + message }] }],
          // gemini-3.6-flash cannot fully disable thinking (budget 0 → HTTP 400);
          // budget 1 is the minimum supported and keeps replies ~3-5s, well
          // inside the 12s AbortController below.
          generationConfig: { thinkingConfig: { thinkingBudget: 1 } },
        }),
        signal: controller.signal,
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
    // Gemini failed or timed out — fall through to the queued reply.
  } finally {
    clearTimeout(timeout);
  }

  // 5. AI failed → save system message, admin will reply later.
  const fallbackMsg = sysText(
    "Your message has been saved. The admin will reply when online.",
    "آپ کا پیغام محفوظ ہو گیا ہے۔ ایڈمن آن لائن ہونے پر جواب دے گا۔",
    "توهان جو پيغام محفوظ ٿي ويو آهي. ايڊمن آن لائن ٿيڻ تي جواب ڏيندو."
  );
  // Best-effort — always return a response even if this insert fails.
  try {
    await supabaseAdmin.from("messages").insert({
      user_id,
      message: fallbackMsg,
      message_ur: language === "ur" ? fallbackMsg : null,
      sender: "system",
    });
  } catch {
    // ignore — best-effort
  }
  return NextResponse.json({ ok: true, mode: "queued", reply: fallbackMsg });
}