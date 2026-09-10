import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";
import { isMemberStatus, type MemberStatus } from "@/lib/member-status";

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
    return internalError("admin/users", profilesError);
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

/**
 * Map the set_member_status() RPC failure reasons to HTTP responses.
 * The RPC is the only writer: it enforces admin authorization at the DB
 * layer (defense in depth) and pairs every status change with its audit row
 * in one transaction.
 */
function rpcFailure(reason: string | null) {
  switch (reason) {
    case "member_not_found":
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    case "invalid_status":
      return NextResponse.json(
        { error: "Invalid status — expected active, inactive or suspended" },
        { status: 400 }
      );
    case "forbidden":
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    default:
      return NextResponse.json(
        { error: `Status change failed (${reason ?? "unknown"}).` },
        { status: 400 }
      );
  }
}

export async function POST(request: Request) {
  const { error, user: adminUser } = await requireAdmin();
  if (error) return error;
  const adminUserId = (adminUser as { id?: string })?.id ?? null;
  if (!adminUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    action?: "toggle_suspend" | "reset_password" | "set_status";
    status?: string;
    reason?: string;
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

  if (action === "set_status" || action === "toggle_suspend") {
    // Resolve the target status.
    let target: MemberStatus;
    if (action === "set_status") {
      if (!isMemberStatus(body.status)) {
        return NextResponse.json(
          { error: "Invalid status — expected active, inactive or suspended" },
          { status: 400 }
        );
      }
      target = body.status;
    } else {
      // Legacy toggle: flip between the member's current state and
      // suspended/previous-state. Route it through the same audited
      // primitive so EVERY status change leaves an audit trail.
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("id, is_active, is_suspended")
        .eq("id", userId)
        .single();
      if (fetchError || !profile) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      target = profile.is_suspended
        ? (profile.is_active ? "active" : "inactive")
        : "suspended";
    }

    // The reason is optional; trim + cap length so the audit stays tidy.
    const reason =
      typeof body.reason === "string" && body.reason.trim() !== ""
        ? body.reason.trim().slice(0, 500)
        : null;

    // Atomic, DB-authorized transition + audit row (one transaction).
    // The RPC works for ANY member regardless of deposits/receipts — there
    // is deliberately no financial precondition here.
    const { data: result, error: rpcError } = await supabase.rpc(
      "set_member_status",
      {
        p_member_id: userId,
        p_status: target,
        p_changed_by: adminUserId,
        p_reason: reason,
      }
    );

    if (rpcError) {
      return internalError("admin/users", rpcError);
    }
    const res = result as {
      ok: boolean;
      changed: boolean;
      status: MemberStatus;
      previous_status: MemberStatus;
      reason?: string;
    } | null;
    if (!res || !res.ok) {
      return rpcFailure(res?.reason ?? null);
    }

    // Read back the authoritative flags so the UI refreshes to the exact
    // server state (suspension preserves is_active — do not assume).
    const { data: updated, error: readError } = await supabase
      .from("profiles")
      .select("is_active, is_suspended")
      .eq("id", userId)
      .single();
    if (readError) {
      return internalError("admin/users", readError);
    }

    return NextResponse.json({
      success: true,
      changed: res.changed,
      status: res.status,
      previous_status: res.previous_status,
      is_active: updated?.is_active ?? false,
      is_suspended: updated?.is_suspended ?? false,
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
      return internalError("admin/users", error);
    }

    return NextResponse.json({ success: true, temporaryPassword: temp });
  }

  return NextResponse.json(
    { error: "Invalid action" },
    { status: 400 }
  );
}
