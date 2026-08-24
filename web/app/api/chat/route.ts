import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const SYSTEM_INSTRUCTION = `You are the TDX support assistant. Answer FAQs about TDX: investment amounts (PKR 5,000 to 2,000,000, no package selection; Saima Easy Paisa Account 0325-2879424), deposits and receipt verification, daily tasks (5/day, Rs 200/day deduction for missed days), monthly profit withdrawals (7%-10% monthly rate selected by the Super Admin at completion, Rs 100 fee, 24-48h, one withdrawal per 30-day cycle, principal stays invested), referrals (Rs 100 bonus), profit payouts, investment returns (45 working days, Sat/Sun excluded). Be friendly and concise.`;

async function askGemini(question: string, language: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return "AI is temporarily unavailable — switch to Real Human";
  }

  let lastError: unknown = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            {
              parts: [{ text: `Reply in ${language}.\n\nUser question: ${question}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text.trim()) return text.trim();
      lastError = new Error(`Gemini ${model} returned empty response.`);
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("Gemini chat failed:", lastError);
  return "AI is temporarily unavailable — switch to Real Human";
}

async function sendHumanEmail(opts: {
  fullName: string;
  username: string;
  mobile: string;
  message: string;
}) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("SMTP not configured — skipping human-chat admin email.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `User wants to chat with a human — ${opts.fullName} (${opts.username})`,
      html: `
        <h2>Real Human Chat Request</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Full Name</b></td><td>${opts.fullName}</td></tr>
          <tr><td><b>Username</b></td><td>${opts.username}</td></tr>
          <tr><td><b>Mobile</b></td><td>${opts.mobile}</td></tr>
        </table>
        <p><b>Message:</b></p>
        <p>${opts.message}</p>
      `,
    });
  } catch (err) {
    console.warn("Failed to send human-chat email:", err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: {
    userId?: string;
    text?: string;
    mode?: string;
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, text, mode, language } = body;

  if (!userId || !text || !text.trim()) {
    return NextResponse.json(
      { error: "userId and text are required" },
      { status: 400 }
    );
  }

  // Verify the authenticated user matches the user_id being operated on.
  if (user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (mode !== "ai" && mode !== "human") {
    return NextResponse.json(
      { error: "mode must be 'ai' or 'human'" },
      { status: 400 }
    );
  }

  const locale = language === "ur" ? "ur" : "en";
  const langName = locale === "ur" ? "Urdu" : "English";

  const supabase = await createServiceRoleClient();

  // 1. Store the user's message (both languages when ur locale).
  const { error: userMsgError } = await supabase.from("messages").insert({
    user_id: userId,
    sender: "user",
    message: text.trim(),
    message_ur: locale === "ur" ? text.trim() : null,
  });

  if (userMsgError) {
    return NextResponse.json({ error: userMsgError.message }, { status: 500 });
  }

  // 1b. Fetch user profile + email the admin on every user message
  //     (skips silently if SMTP not configured).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, mobile_number")
    .eq("id", userId)
    .single();

  if (SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transporter.sendMail({
        from: SMTP_USER,
        to: ADMIN_EMAIL,
        subject: `New message from user ${profile?.full_name ?? "Unknown"}`,
        html: `<h2>New message from ${profile?.full_name ?? "Unknown"} (@${profile?.username ?? "Unknown"})</h2><p><b>Message:</b> ${text.trim()}</p>`,
      });
    } catch (err) {
      console.warn("Failed to send admin chat email:", err);
    }
  }

  // 2. Route based on mode.
  if (mode === "ai") {
    const reply = await askGemini(text.trim(), langName);

    // Store the AI reply.
    const { error: aiMsgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "ai",
      message: reply,
      message_ur: locale === "ur" ? reply : null,
    });

    if (aiMsgError) {
      return NextResponse.json({ error: aiMsgError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, reply });
  }

  // Real Human mode (admin email handled above for all modes; keep legacy helper).
  await sendHumanEmail({
    fullName: profile?.full_name ?? "Unknown",
    username: profile?.username ?? "Unknown",
    mobile: profile?.mobile_number ?? "Unknown",
    message: text.trim(),
  });

  const humanReply =
    locale === "ur"
      ? "ایک ایڈمن جلد جواب دے گا۔"
      : "A human admin will reply soon.";

  return NextResponse.json({
    success: true,
    reply: humanReply,
  });
}