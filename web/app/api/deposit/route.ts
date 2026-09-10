import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import nodemailer from "nodemailer";
import { internalError, escapeHtml, logServerWarn } from "@/lib/api-errors";
import { isValidDepositAmount, PAYMENT_ACCOUNT } from "@/lib/investment";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

const GEMINI_MODELS = ["gemini-3.6-flash"];

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
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

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

  logServerWarn("deposit", lastError, "gemini analysis failed");
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
  paymentMethod: string;
  cashAgentName?: string | null;
  cashPaymentDate?: string | null;
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

    const isCash = opts.paymentMethod === "cash_agent";
    const subject = isCash
      ? `New Cash Deposit Verification Required — ${opts.fullName} (${opts.username}) — Rs ${Number(opts.amount).toLocaleString()} `
      : `New Online Deposit Verification Required — ${opts.fullName} (${opts.username}) — Rs ${Number(opts.amount).toLocaleString()} `;

    const html = isCash
      ? `
        <h2>New Cash Deposit Verification Required</h2>
        <p>Member: ${escapeHtml(opts.fullName)} (@${escapeHtml(opts.username)})</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Full Name</b></td><td>${escapeHtml(opts.fullName)}</td></tr>
          <tr><td><b>Username</b></td><td>${escapeHtml(opts.username)}</td></tr>
          <tr><td><b>Mobile</b></td><td>${escapeHtml(opts.mobile)}</td></tr>
          <tr><td><b>Amount</b></td><td>Rs ${escapeHtml(opts.amount)}</td></tr>
          <tr><td><b>Method</b></td><td>Cash to Agent</td></tr>
          <tr><td><b>Agent</b></td><td>${escapeHtml(opts.cashAgentName ?? "Shakeela")}</td></tr>
          <tr><td><b>Cash Payment Date</b></td><td>${escapeHtml(opts.cashPaymentDate ? new Date(opts.cashPaymentDate).toLocaleDateString("en-GB") : "—")}</td></tr>
        </table>
        <p>Please verify the cash payment.</p>
      `
      : `
        <h2>New Online Deposit Verification Required</h2>
        <p>Member: ${escapeHtml(opts.fullName)} (@${escapeHtml(opts.username)})</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Full Name</b></td><td>${escapeHtml(opts.fullName)}</td></tr>
          <tr><td><b>Username</b></td><td>${escapeHtml(opts.username)}</td></tr>
          <tr><td><b>Mobile</b></td><td>${escapeHtml(opts.mobile)}</td></tr>
          <tr><td><b>Amount</b></td><td>Rs ${escapeHtml(opts.amount)}</td></tr>
          <tr><td><b>Method</b></td><td>Online Transfer</td></tr>
          <tr><td><b>Payment Account</b></td><td>${escapeHtml(PAYMENT_ACCOUNT.accountName)} — ${escapeHtml(PAYMENT_ACCOUNT.method)} ${escapeHtml(PAYMENT_ACCOUNT.accountNumber)}</td></tr>
          <tr><td><b>AI Verdict</b></td><td>${escapeHtml(opts.verdict)} (${escapeHtml(opts.confidence)}%)</td></tr>
        </table>
        <p>Receipt: ${
          opts.receiptUrl
            ? `<a href="${escapeHtml(opts.receiptUrl)}">View Receipt (link valid for 1 hour)</a>`
            : "link unavailable — view via the admin panel"
        }</p>
        <p>Please verify the payment.</p>
      `;

    await transporter.sendMail({
      from: SMTP_USER,
      to: ADMIN_EMAIL,
      subject,
      html,
    });
  } catch (err) {
    logServerWarn("deposit", err, "failed to send admin email");
  }
}

async function notifyAdmins(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  opts: {
    memberName: string;
    amount: number;
    paymentMethod: string;
    cashAgentName?: string | null;
    cashPaymentDate?: string | null;
    receiptUrl?: string;
  }
) {
  const isCash = opts.paymentMethod === "cash_agent";
  const title = isCash ? "New Cash Deposit Verification Required" : "New Online Deposit Verification Required";
  const titleUr = isCash ? "نئی نقد ڈپازٹ تصدیق درکار" : "نئی آن لائن ڈپازٹ تصدیق درکار";

  const message = isCash
    ? `Member: ${opts.memberName}\nAmount: Rs ${Number(opts.amount).toLocaleString()}\nMethod: Cash to Agent\nAgent: ${opts.cashAgentName ?? "Shakeela"}\nCash Payment Date: ${opts.cashPaymentDate ? new Date(opts.cashPaymentDate).toLocaleDateString("en-GB") : "—"}\nPlease verify the cash payment.`
    : `Member: ${opts.memberName}\nAmount: Rs ${Number(opts.amount).toLocaleString()}\nMethod: Online Transfer\nPayment Account: ${PAYMENT_ACCOUNT.accountName} — ${PAYMENT_ACCOUNT.method} ${PAYMENT_ACCOUNT.accountNumber}\nReceipt: ${opts.receiptUrl ? "[View Receipt]" : "[View in admin panel]"}\nPlease verify the payment.`;

  const messageUr = isCash
    ? `ممبر: ${opts.memberName}\nرقم: ${Number(opts.amount).toLocaleString()} روپے\nطریقہ: کیش ٹو ایجنٹ\nایجنٹ: ${opts.cashAgentName ?? "Shakeela"}\nادائیگی کی تاریخ: ${opts.cashPaymentDate ? new Date(opts.cashPaymentDate).toLocaleDateString("en-GB") : "—"}\nبراہ کرم نقد ادائیگی کی تصدیق کریں۔`
    : `ممبر: ${opts.memberName}\nرقم: ${Number(opts.amount).toLocaleString()} روپے\nطریقہ: آن لائن ٹرانسفر\nاکاؤنٹ: ${PAYMENT_ACCOUNT.accountName} — ${PAYMENT_ACCOUNT.method} ${PAYMENT_ACCOUNT.accountNumber}\nرسید: دیکھیں\nبراہ کرم ادائیگی کی تصدیق کریں۔`;

  try {
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    if (!admins || admins.length === 0) return;
    const rows = admins.map((a: any) => ({
      user_id: a.id,
      title,
      title_ur: titleUr,
      message,
      message_ur: messageUr,
      is_read: false,
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) logServerWarn("deposit", error, "admin in-app notification insert failed");
  } catch (err) {
    logServerWarn("deposit", err, "admin notify failed");
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  // SUSPENSION GATE: a suspended member cannot submit or update deposits.
  // (Pure access control — no deposit/receipt calculation is modified.)
  const userClient = await createClient();
  const { data: me } = await userClient
    .from("profiles")
    .select("is_suspended")
    .eq("id", user.id)
    .single();
  if (me?.is_suspended) {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }

  let body: { depositId?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = user.id;
  const { depositId } = body;

  if (!depositId) {
    return NextResponse.json({ error: "depositId is required" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Read deposit record (ownership enforced)
  const { data: deposit, error: depositError } = await supabase
    .from("deposits")
    .select("id, user_id, package_id, amount, receipt_image_url, status, uploaded_at, payment_method, cash_agent_name, cash_payment_date")
    .eq("id", depositId)
    .eq("user_id", userId)
    .single();

  if (depositError || !deposit) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }

  // Server-side amount validation (defense in depth — DB CHECK is final)
  const rawAmount = Number((deposit as any).amount);
  if (!isValidDepositAmount(rawAmount)) {
    return NextResponse.json({ error: "Deposit amount must be between 5000 and 2000000" }, { status: 400 });
  }

  const paymentMethod = (deposit as any).payment_method ?? "online_transfer";

  // Fetch profile for notifications/emails
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, mobile_number, email")
    .eq("id", userId)
    .single();

  const memberDisplay = profile?.full_name ?? profile?.username ?? "Member";

  // 2. For ONLINE_TRANSFER: fetch receipt, analyze with Gemini, store verdict
  let analysis = { verdict: "uncertain", confidence: 0, reasons: [] as string[] };
  let receiptSignedUrl = "";

  if (paymentMethod === "online_transfer") {
    let base64Image = "";
    let mimeType = "image/jpeg";

    if ((deposit as any).receipt_image_url) {
      const path = (deposit as any).receipt_image_url;
      const { data: fileData, error: fileError } = await supabase.storage.from("receipts").download(path);

      if (!fileError && fileData) {
        if (fileData.size > MAX_RECEIPT_BYTES) {
          console.warn(`Receipt too large for Gemini analysis (${fileData.size} bytes) — skipping.`);
        } else {
          const arrayBuffer = await fileData.arrayBuffer();
          base64Image = Buffer.from(arrayBuffer).toString("base64");
          mimeType = (fileData as any).type || "image/jpeg";
        }
      }

      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from("receipts")
        .createSignedUrl(path, 3600, { download: false });

      if (signedUrlError || !signedData?.signedUrl) {
        logServerWarn("deposit", signedUrlError, "could not create signed receipt URL");
      } else {
        receiptSignedUrl = signedData.signedUrl;
      }
    }

    analysis = await analyzeReceiptWithGemini(base64Image, mimeType);

    const { error: updateError } = await supabase
      .from("deposits")
      .update({
        ai_verdict: analysis.verdict,
        ai_confidence: analysis.confidence,
      })
      .eq("id", depositId);

    if (updateError) {
      return internalError("deposit", updateError);
    }
  } else {
    // Cash deposit: no AI analysis, optionally mark as uncertain
    // Do not overwrite receipt fields
    analysis = { verdict: "cash", confidence: 0, reasons: ["Cash to agent — no receipt analysis."] };
    // Ensure we don't try to fetch receipt for cash
  }

  // 3. In-app notification for admins + admin email (both methods)
  await notifyAdmins(supabase, {
    memberName: memberDisplay,
    amount: (deposit as any).amount,
    paymentMethod,
    cashAgentName: (deposit as any).cash_agent_name ?? "Shakeela",
    cashPaymentDate: (deposit as any).cash_payment_date,
    receiptUrl: receiptSignedUrl,
  });

  let packageName = "Investment";
  if ((deposit as any).package_id) {
    const { data: pkg } = await supabase.from("packages").select("package_name").eq("id", (deposit as any).package_id).single();
    packageName = pkg?.package_name ?? "Investment";
  }

  await sendAdminEmail({
    fullName: profile?.full_name ?? "Unknown",
    username: profile?.username ?? "Unknown",
    mobile: profile?.mobile_number ?? "Unknown",
    amount: (deposit as any).amount,
    paymentMethod,
    cashAgentName: (deposit as any).cash_agent_name ?? null,
    cashPaymentDate: (deposit as any).cash_payment_date ?? null,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    receiptUrl: receiptSignedUrl,
  });

  return NextResponse.json({
    success: true,
    payment_method: paymentMethod,
    ai_verdict: analysis.verdict,
    ai_confidence: analysis.confidence,
  });
}
