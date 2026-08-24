import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

// Free-tier guard: never send more than ~4 MB of image data to Gemini.
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

const SYSTEM_INSTRUCTION = `Act as a financial document fraud detector. Analyze the provided receipt screenshot image.
Check for: visible transaction ID, sender/receiver details, EasyPaisa/JazzCash/Upaisa branding, amount legibility, date, and signs of editing (cropped edges, mismatched fonts, smudged text, overlays).
Reply JSON ONLY in this exact format: {"verdict":"real"|"fake"|"uncertain","confidence":0-100,"reasons":["..."]}`;

async function analyzeReceiptWithGemini(
  base64Image: string,
  mimeType: string
): Promise<{ verdict: string; confidence: number; reasons: string[] }> {
  if (!GEMINI_API_KEY) {
    return {
      verdict: "uncertain",
      confidence: 0,
      reasons: ["GEMINI_API_KEY not configured — AI analysis skipped."],
    };
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
              parts: [
                { text: "Analyze this payment receipt screenshot." },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText}`);
        continue; // try next model
      }

      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      // Extract the JSON object from the response (strip markdown fences if any).
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = new Error(`Gemini ${model} returned no JSON.`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        verdict: parsed.verdict ?? "uncertain",
        confidence: Number(parsed.confidence) || 0,
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      };
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("Gemini analysis failed:", lastError);
  return {
    verdict: "uncertain",
    confidence: 0,
    reasons: ["AI analysis failed — manual review required."],
  };
}

async function sendAdminEmail(opts: {
  fullName: string;
  username: string;
  mobile: string;
  amount: number;
  packageName: string;
  verdict: string;
  confidence: number;
  receiptUrl: string;
}) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("SMTP not configured — skipping admin notification email.");
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
      subject: `New Deposit Request — ${opts.fullName} (${opts.username})`,
      html: `
        <h2>New Deposit Request</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Full Name</b></td><td>${opts.fullName}</td></tr>
          <tr><td><b>Username</b></td><td>${opts.username}</td></tr>
          <tr><td><b>Mobile</b></td><td>${opts.mobile}</td></tr>
          <tr><td><b>Amount</b></td><td>${opts.amount} PKR</td></tr>
          <tr><td><b>Package</b></td><td>${opts.packageName}</td></tr>
          <tr><td><b>AI Verdict</b></td><td>${opts.verdict} (${opts.confidence}%)</td></tr>
        </table>
        <p>Receipt: <a href="${opts.receiptUrl}">View receipt</a></p>
      `,
    });
  } catch (err) {
    console.warn("Failed to send admin email:", err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { depositId?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The authenticated session is the only trusted identity — a client-supplied
  // userId is ignored (kept in the type for backward compatibility).
  const userId = user.id;
  const { depositId } = body;

  if (!depositId) {
    return NextResponse.json(
      { error: "depositId is required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // 1. Read the deposit record (ownership enforced via user_id filter).
  const { data: deposit, error: depositError } = await supabase
    .from("deposits")
    .select(
      "id, user_id, package_id, amount, receipt_image_url, status, uploaded_at"
    )
    .eq("id", depositId)
    .eq("user_id", userId)
    .single();

  if (depositError || !deposit) {
    return NextResponse.json(
      { error: depositError?.message ?? "Deposit not found" },
      { status: 404 }
    );
  }

  // 2. Fetch the receipt image from Supabase Storage.
  let base64Image = "";
  let mimeType = "image/jpeg";
  let receiptPublicUrl = "";

  if (deposit.receipt_image_url) {
    const path = deposit.receipt_image_url;
    const { data: fileData, error: fileError } = await supabase.storage
      .from("receipts")
      .download(path);

    if (!fileError && fileData) {
      // Guard the Gemini free tier: skip AI analysis for oversized files
      // instead of uploading a huge base64 payload to the API.
      if (fileData.size > MAX_RECEIPT_BYTES) {
        console.warn(
          `Receipt too large for Gemini analysis (${fileData.size} bytes) — skipping.`
        );
      } else {
        const arrayBuffer = await fileData.arrayBuffer();
        base64Image = Buffer.from(arrayBuffer).toString("base64");
        mimeType = fileData.type || "image/jpeg";
      }
    }

    const { data: urlData } = supabase.storage
      .from("receipts")
      .getPublicUrl(path);
    receiptPublicUrl = urlData.publicUrl;
  }

  // 3. Analyze with Gemini (degrades gracefully if no key).
  const analysis = await analyzeReceiptWithGemini(base64Image, mimeType);

  // 4. Store AI verdict + confidence on the deposit.
  const { error: updateError } = await supabase
    .from("deposits")
    .update({
      ai_verdict: analysis.verdict,
      ai_confidence: analysis.confidence,
    })
    .eq("id", depositId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 5. Fetch user profile for the email.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, mobile_number")
    .eq("id", userId)
    .single();

  // 6. Email admin (skips silently if SMTP not configured). New deposits
  //    have no package (package model removed) — packageName is optional.
  let packageName = "Investment";
  if (deposit.package_id) {
    const { data: pkg } = await supabase
      .from("packages")
      .select("package_name")
      .eq("id", deposit.package_id)
      .single();
    packageName = pkg?.package_name ?? "Investment";
  }

  await sendAdminEmail({
    fullName: profile?.full_name ?? "Unknown",
    username: profile?.username ?? "Unknown",
    mobile: profile?.mobile_number ?? "Unknown",
    amount: deposit.amount,
    packageName,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    receiptUrl: receiptPublicUrl,
  });

  return NextResponse.json({
    success: true,
    ai_verdict: analysis.verdict,
    ai_confidence: analysis.confidence,
  });
}