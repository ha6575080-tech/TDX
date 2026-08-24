import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 1000);

  const supabase = await createServiceRoleClient();

  // 1. Fetch all profiles.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, username, city, address, mobile_number, account_number, payment_method, is_active, is_suspended, created_at, profit_activation_date"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  // 2. Fetch approved deposit sums per user.
  const { data: approvedDeposits } = await supabase
    .from("deposits")
    .select("user_id, amount")
    .eq("status", "approved");

  // 3. Fetch withdrawal sums per user.
  const { data: withdrawals } = await supabase
    .from("withdrawals")
    .select("user_id, amount");

  const depositByUser = new Map<string, number>();
  for (const d of approvedDeposits ?? []) {
    depositByUser.set(d.user_id, (depositByUser.get(d.user_id) ?? 0) + (d.amount ?? 0));
  }

  const withdrawByUser = new Map<string, number>();
  for (const w of withdrawals ?? []) {
    withdrawByUser.set(w.user_id, (withdrawByUser.get(w.user_id) ?? 0) + (w.amount ?? 0));
  }

  const users = (profiles ?? []).map((p) => ({
    ...p,
    total_deposited: depositByUser.get(p.id) ?? 0,
    total_withdrawn: withdrawByUser.get(p.id) ?? 0,
  }));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: {
    userId?: string;
    action?: "toggle_suspend" | "reset_password";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, action } = body;
  if (!userId || !action) {
    return NextResponse.json(
      { error: "userId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  if (action === "toggle_suspend") {
    const { data: profile, error: fetchError } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", userId)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: fetchError?.message ?? "User not found" },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_suspended: !profile.is_suspended })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      is_suspended: !profile.is_suspended,
    });
  }

  if (action === "reset_password") {
    // Generate a temporary password and show it to the admin once.
    const temp = Array.from(
      { length: 8 },
      () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
        Math.floor(Math.random() * 62)
      ]
    ).join("");

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: temp,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, temporaryPassword: temp });
  }

  return NextResponse.json(
    { error: "Invalid action" },
    { status: 400 }
  );
}