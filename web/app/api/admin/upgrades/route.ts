import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError, logServerWarn } from "@/lib/api-errors";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: upgrades, error: upgradesError } = await supabase
    .from("investment_upgrades")
    .select(
      "id, user_id, previous_amount, requested_amount, increase_amount, status, requested_at, activated_at, activated_after_entity, decided_at, decision_note, profiles(full_name, username, mobile_number)"
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  if (upgradesError) {
    return internalError("admin/upgrades", upgradesError);
  }

  const parsed = (upgrades ?? []).map((u: any) => ({
    id: u.id,
    user_id: u.user_id,
    previous_amount: u.previous_amount,
    requested_amount: u.requested_amount,
    increase_amount: u.increase_amount,
    status: u.status,
    requested_at: u.requested_at,
    activated_at: u.activated_at,
    activated_after_entity: u.activated_after_entity,
    decided_at: u.decided_at,
    decision_note: u.decision_note,
    fullName: u.profiles?.full_name ?? "Unknown",
    username: u.profiles?.username ?? "Unknown",
    mobile: u.profiles?.mobile_number ?? "Unknown",
  }));

  return NextResponse.json({ upgrades: parsed });
}

export async function POST(request: Request) {
  const { user: adminUser, error } = await requireAdmin();
  if (error) return error;
  const adminId = adminUser!.id;

  let body: { upgradeId?: string; action?: "reject" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { upgradeId, action } = body;
  if (!upgradeId || !action) {
    return NextResponse.json(
      { error: "upgradeId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { data: up, error: fetchError } = await supabase
    .from("investment_upgrades")
    .select("id, user_id, previous_amount, requested_amount, status")
    .eq("id", upgradeId)
    .single();

  if (fetchError || !up) {
    return NextResponse.json(
      { error: "Upgrade not found" },
      { status: 404 }
    );
  }

  if (action === "reject") {
    if (up.status !== "pending") {
      return NextResponse.json(
        { error: `Only a pending upgrade can be rejected (status: ${up.status}).` },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from("investment_upgrades")
      .update({
        status: "rejected",
        decided_by: adminId,
        decided_at: nowIso,
        decision_note: "Rejected by super admin.",
      })
      .eq("id", upgradeId)
      .eq("status", "pending")
      .select("id");

    if (updateError) {
      return internalError("admin/upgrades", updateError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Upgrade was already processed." },
        { status: 409 }
      );
    }

    const msgEn = `Your investment upgrade request (PKR ${up.requested_amount}) has been rejected. Your investment remains PKR ${up.previous_amount}.`;
    const msgUr = `آپ کی سرمایہ کاری میں اضافے کی درخواست (${up.requested_amount} روپے) مسترد کر دی گئی ہے۔ آپ کی سرمایہ کاری ${up.previous_amount} روپے ہی رہے گی۔`;

    const { error: notifInsertError } = await supabase.from("notifications").insert({
      user_id: up.user_id,
      title: "Investment Upgrade Rejected",
      title_ur: "درخواست مسترد",
      message: msgEn,
      message_ur: msgUr,
      is_read: false,
    });
    if (notifInsertError) {
      // Rejection is already applied and authoritative — log only, never fail.
      logServerWarn("admin/upgrades", notifInsertError, "notification insert failed");
    }

    const { error: msgError } = await supabase.from("messages").insert({
      user_id: up.user_id,
      sender: "system",
      message: msgEn,
      message_ur: msgUr,
      is_read: false,
    });
    if (msgError) {
      // Rejection is already applied and authoritative — log only.
      logServerWarn("admin/upgrades", msgError, "rejection message insert failed");
    }

    await supabase.from("financial_audit_log").insert({
      entity: "investment_upgrade",
      entity_id: upgradeId,
      user_id: up.user_id,
      actor_id: adminId,
      previous_status: "pending",
      new_status: "rejected",
      amount: up.requested_amount,
      note: "rejected by super admin",
    });

    return NextResponse.json({ success: true, status: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}