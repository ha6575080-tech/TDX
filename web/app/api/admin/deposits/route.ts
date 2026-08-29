import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

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
    return NextResponse.json({ error: depositsError.message }, { status: 500 });
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
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
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
      "id, user_id, package_id, amount, status, packages(package_name, monthly_return_percent)"
    )
    .eq("id", depositId)
    .single();

  if (depositError || !deposit) {
    return NextResponse.json(
      { error: depositError?.message ?? "Deposit not found" },
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
      return NextResponse.json({ error: updateDepositError.message }, { status: 500 });
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
      return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
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
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

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
      return NextResponse.json({ error: updateDepositError.message }, { status: 500 });
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
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}