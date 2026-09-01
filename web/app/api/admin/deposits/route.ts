import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPushToSubscriptions } from "@/lib/push";
import { internalError, logServerWarn } from "@/lib/api-errors";

/**
 * Create an in-app notification for a specific member and attempt best-effort
 * push delivery. Uses the existing `notifications` table (which has
 * owner-only RLS: user_id = auth.uid()) and the existing push helper from
 * `lib/push.ts`. Neither failure is allowed to affect the financial state
 * transition that has already been applied successfully.
 */
async function notifyMember(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  title: string,
  message: string,
  title_ur: string,
  message_ur: string
) {
  // In-app notification (persisted, visible in NotificationBell/inbox).
  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: userId,
    title,
    message,
    title_ur,
    message_ur,
    is_read: false,
  });
  if (notifError) {
    // Observability only — the financial transition has already been applied
    // and must never be rolled back or blocked by a notification failure.
    logServerWarn(
      "admin/deposits",
      notifError,
      "in-app notification insert failed (financial state already applied)"
    );
  }

  // Best-effort push — never blocks or fails the approval flow.
  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (subs && subs.length > 0) {
      const pushResult = await sendPushToSubscriptions(
        subs as Array<{ endpoint: string; p256dh: string; auth: string }>,
        JSON.stringify({ title, message })
      );
      if (pushResult.failed > 0) {
        logServerWarn(
          "admin/deposits",
          new Error("push_delivery_partial_failure"),
          `push: sent=${pushResult.sent} failed=${pushResult.failed}`
        );
      }
    }
  } catch (pushErr) {
    // Push is best-effort; the in-app notification is the authoritative copy.
    logServerWarn("admin/deposits", pushErr, "push delivery failed (non-blocking)");
  }
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  // NOTE: no profiles(...) embed — deposits has TWO foreign keys to profiles
  // (user_id and approved_by), so PostgREST cannot infer the relationship
  // ("more than one relationship was found"). Profiles are fetched explicitly
  // below using each trusted deposit.user_id.
  const { data: deposits, error: depositsError } = await supabase
    .from("deposits")
    .select(
      "id, user_id, package_id, amount, receipt_image_url, ai_verdict, ai_confidence, status, uploaded_at, approved_at, invoice_url, admin_notes, packages(package_name, monthly_return_percent)"
    )
    .order("uploaded_at", { ascending: false })
    .limit(200);

  if (depositsError) {
    return internalError("admin/deposits", depositsError);
  }

  // One batched profile lookup for all deposit owners (avoids N+1).
  const userIds = [...new Set((deposits ?? []).map((d: any) => d.user_id))];
  const profileMap = new Map<string, any>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, username, mobile_number")
      .in("id", userIds);
    if (profilesError) {
      return internalError("admin/deposits", profilesError);
    }
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }
  }

  // Parse the joined shape (Supabase returns nested objects).
  const parsed = (deposits ?? []).map((d: any) => {
    const profile = profileMap.get(d.user_id);
    return {
      id: d.id,
      user_id: d.user_id,
      package_id: d.package_id,
      amount: d.amount,
      receipt_image_url: d.receipt_image_url,
      ai_verdict: d.ai_verdict,
      ai_confidence: d.ai_confidence,
      status: d.status,
      uploaded_at: d.uploaded_at,
      approved_at: d.approved_at,
      invoice_url: d.invoice_url,
      admin_notes: d.admin_notes,
      fullName: profile?.full_name ?? "Unknown",
      username: profile?.username ?? "Unknown",
      mobile: profile?.mobile_number ?? "Unknown",
      packageName: d.packages?.package_name ?? "Unknown",
      monthlyReturnPercent: d.packages?.monthly_return_percent ?? 0,
    };
  });

  return NextResponse.json({ deposits: parsed });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { depositId?: string; action?: "approve" | "reject" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { depositId, action } = body;
  if (!depositId || !action) {
    return NextResponse.json(
      { error: "depositId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // 1. Fetch the deposit. No profiles(...) embed — ambiguous (see GET); the
  //    profile's full_name is not used by this handler anyway.
  const { data: deposit, error: depositError } = await supabase
    .from("deposits")
    .select(
            "id, user_id, package_id, amount, status, approved_at, packages(package_name, monthly_return_percent)"
    )
    .eq("id", depositId)
    .single();

  if (depositError || !deposit) {
    return NextResponse.json(
      { error: "Deposit not found" },
      { status: 404 }
    );
  }

  const userId = deposit.user_id;

  // Idempotency: only a deposit still in 'pending' may transition. The
  // conditional update below is the guard — re-submitting an already-approved
  // or rejected deposit updates zero rows and returns a conflict.
  const EXPECTED_STATUS = action === "approve" ? "pending" : "pending";

  if (action === "approve") {
    const now = new Date().toISOString();
    const invoiceUrl = `/invoice/${depositId}`;

    // 2a. Update deposit -> approved (only from 'pending').
    const { data: updatedRows, error: updateDepositError } = await supabase
      .from("deposits")
      .update({
        status: "approved",
        approved_at: now,
        invoice_url: invoiceUrl,
      })
      .eq("id", depositId)
      .eq("status", EXPECTED_STATUS)
      .select("id");
    if (updateDepositError) {
      return internalError("admin/deposits", updateDepositError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Deposit is not pending — already processed." },
        { status: 409 }
      );
    }

    // 2b. Update user profile -> active + profit activation. The package
    //     model is removed from the active product, so package_id is no
    //     longer written here (historical rows are untouched).
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        is_active: true,
        is_suspended: false,
        profit_activation_date: now,
      })
      .eq("id", userId);
    if (updateProfileError) {
      return internalError("admin/deposits", updateProfileError);
    }

    // 2c. NOTE: no profit row is created at approval anymore. Monthly profit
    //     is now paid exclusively through the cycle-based withdrawal flow —
    //     complete_profit_withdrawal() records the paid profit in the
    //     profits ledger atomically at completion. This keeps the profits
    //     table as the single accounting mechanism.

    // 2d. System message to user (both languages).
    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message:
        "Congratulations! Your deposit has been approved and your profit program is now active.",
      message_ur:
        "مبارک ہو! آپ کا ڈپازٹ منظور ہو گیا ہے اور آپ کا منافع پروگرام اب فعال ہے۔",
      is_read: false,
    });
        if (msgError) {
      return internalError("admin/deposits", msgError);
    }

    // Deposit approval notification (amount + cycle start are trusted, derived
    // server-side). Best-effort — failure must not roll back the financial state.
    const cycleDate = new Date(deposit.approved_at ?? now).toLocaleDateString(
      "en-PK"
    );
    await notifyMember(
      supabase,
      userId,
      "Investment Approved",
      `Your investment of ${Number(deposit.amount).toLocaleString()} PKR has been approved. Your profit cycle starts ${cycleDate}.`,
      "سرمایہ کاری منظور",
      `آپ کی سرمایہ کاری ${Number(deposit.amount).toLocaleString()} پاکستانی روپی منظور ہو گئی ہے۔ آپ کا منافع چکر ${cycleDate} سے شروع ہوتا ہے۔`
    );

    return NextResponse.json({ success: true, status: "approved" });
  }

  if (action === "reject") {
    // 3a. Update deposit -> rejected with admin_notes (only from 'pending').
    const { data: updatedRows, error: updateDepositError } = await supabase
      .from("deposits")
      .update({
        status: "rejected",
        admin_notes: "Not received",
      })
      .eq("id", depositId)
      .eq("status", EXPECTED_STATUS)
      .select("id");
    if (updateDepositError) {
      return internalError("admin/deposits", updateDepositError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Deposit is not pending — already processed." },
        { status: 409 }
      );
    }

    // 3b. System message to user (both languages).
    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message:
        "Your deposit amount has not received yet, please try again and upload the real screenshot.",
      message_ur:
        "آپ کی ڈپازٹ رقم ابھی موصول نہیں ہوئی، براہ کرم دوبارہ کوشش کریں اور حقیقی اسکرین شاٹ اپ لوڈ کریں۔",
      is_read: false,
    });
        if (msgError) {
      return internalError("admin/deposits", msgError);
    }

    // Deposit rejection notification (amount is trusted, derived server-side).
    // Best-effort — failure must not roll back the financial state.
    await notifyMember(
      supabase,
      userId,
      "Deposit Update",
      `Your deposit of ${Number(deposit.amount).toLocaleString()} PKR was not approved. Please review the details or contact support.`,
      "ڈپازٹ کی اپ ڈیٹ",
      `آپ کی ڈپازٹ ${Number(deposit.amount).toLocaleString()} پاکستانی روپی منظور نہیں ہوئی۔ براہ کرم تفصیلات کا جائزہ لیں یا رابطہ کریں۔`
    );

    return NextResponse.json({ success: true, status: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}