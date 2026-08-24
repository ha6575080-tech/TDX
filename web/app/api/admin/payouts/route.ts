import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "ha6575080@gmail.com";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: profits, error: profitsError } = await supabase
    .from("profits")
    .select(
      "id, user_id, month, year, amount, status, payout_date, profiles(full_name, username)"
    )
    .order("payout_date", { ascending: true })
    .limit(200);

  if (profitsError) {
    return NextResponse.json({ error: profitsError.message }, { status: 500 });
  }

  const now = Date.now();
  const fiveHours = 5 * 60 * 60 * 1000;

  const parsed = (profits ?? []).map((p: any) => {
    const payoutTime = p.payout_date ? new Date(p.payout_date).getTime() : null;
    const dueSoon =
      p.status === "pending" &&
      payoutTime !== null &&
      payoutTime - now <= fiveHours &&
      payoutTime - now >= 0;
    return {
      id: p.id,
      user_id: p.user_id,
      month: p.month,
      year: p.year,
      amount: p.amount,
      status: p.status,
      payout_date: p.payout_date,
      dueSoon,
      fullName: p.profiles?.full_name ?? "Unknown",
      username: p.profiles?.username ?? "Unknown",
    };
  });

  return NextResponse.json({ payouts: parsed });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { profitId?: string; action?: "payout" | "remind" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { profitId, action } = body;
  if (!profitId || !action) {
    return NextResponse.json(
      { error: "profitId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { data: profit, error: fetchError } = await supabase
    .from("profits")
    .select("id, user_id, amount, month, year, status, payout_date")
    .eq("id", profitId)
    .single();

  if (fetchError || !profit) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Profit not found" },
      { status: 404 }
    );
  }

  if (action === "payout") {
    // Idempotency: only a 'pending' profit may be marked paid. Re-submitting
    // an already-paid payout updates zero rows and returns a conflict.
    const { data: updatedRows, error: updateError } = await supabase
      .from("profits")
      .update({ status: "paid", payout_date: new Date().toISOString() })
      .eq("id", profitId)
      .eq("status", "pending")
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Payout is not pending — already processed." },
        { status: 409 }
      );
    }

    // AUTHORITATIVE "next payout paid" event: activate any pending
    // investment upgrade now (server-side only; no-op when none exists).
    await supabase.rpc("activate_pending_upgrade", {
      p_user_id: profit.user_id,
      p_entity: "payout",
      p_entity_id: profitId,
    });

    const amount = profit.amount ?? 0;
    const { error: msgError } = await supabase.from("messages").insert({
      user_id: profit.user_id,
      sender: "system",
      message: `Congratulations! Your monthly profit of Rs ${amount} has been sent to your account.`,
      message_ur: `مبارک ہو! آپ کا ${amount} روپے کا ماہانہ منافع آپ کے اکاؤنٹ میں بھیج دیا گیا ہے۔`,
      is_read: false,
    });
    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "paid" });
  }

  if (action === "remind") {
    // Email admin listing upcoming payouts due soon.
    if (!SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ success: true, emailed: false });
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
        subject: "TDX — Upcoming Payouts Due Soon",
        html: `<h2>Payout Reminder</h2><p>Profit ${profit.amount} PKR for ${profit.month}/${profit.year} is due soon (payout date: ${profit.payout_date}).</p>`,
      });
      return NextResponse.json({ success: true, emailed: true });
    } catch (err) {
      console.warn("Failed to send payout reminder email:", err);
      return NextResponse.json({ success: true, emailed: false });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}