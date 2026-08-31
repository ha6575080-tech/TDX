import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";

const RETURN_WINDOW_DAYS = 60;

// Exact member messaging required by the business spec (bilingual).
const APPROVAL_MSG_EN =
  "Your request has been successfully processed. Please expect your return investment within 60 days.\n\nNote: From now, your withdrawal, profit, and payout activities have been placed on hold.";
const APPROVAL_MSG_UR =
  "آپ کی درخواست کامیابی سے منظور/پروسیس کر دی گئی ہے۔ براہِ کرم اپنی اصل سرمایہ کاری کی واپسی کے لیے 60 دن تک انتظار کریں۔\n\nنوٹ: اب سے آپ کی رقم نکلوانے (Withdrawal)، منافع (Profit) اور Payout کی سرگرمیاں روک دی گئی ہیں۔";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: returns, error: returnsError } = await supabase
    .from("investment_returns")
    .select(
      "id, user_id, amount, returned_amount, status, requested_at, approved_at, approved_by, completed_at, completed_by, expected_return_date, profiles(full_name, username, mobile_number)"
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  if (returnsError) {
    return internalError("admin/returns", returnsError);
  }

  const parsed = (returns ?? []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    amount: r.amount,
    returned_amount: r.returned_amount,
    status: r.status,
    requested_at: r.requested_at,
    approved_at: r.approved_at,
    approved_by: r.approved_by,
    completed_at: r.completed_at,
    completed_by: r.completed_by,
    expected_return_date: r.expected_return_date,
    fullName: r.profiles?.full_name ?? "Unknown",
    username: r.profiles?.username ?? "Unknown",
    mobile: r.profiles?.mobile_number ?? "Unknown",
  }));

  return NextResponse.json({ returns: parsed });
}

export async function POST(request: Request) {
  // Server-side authorization: only an admin session may act.
  const { user: adminUser, error } = await requireAdmin();
  if (error) return error;
  const adminId = adminUser!.id;

  let body: {
    returnId?: string;
    action?: "approve" | "reject" | "mark_completed";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { returnId, action } = body;
  if (!returnId || !action) {
    return NextResponse.json(
      { error: "returnId and action are required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { data: ret, error: fetchError } = await supabase
    .from("investment_returns")
    .select("id, user_id, amount, status")
    .eq("id", returnId)
    .single();

  if (fetchError || !ret) {
    return NextResponse.json(
      { error: "Return request not found" },
      { status: 404 }
    );
  }

  const userId = ret.user_id;
  const amount = Number(ret.amount ?? 0);

  // ------------------------------------------------------------------
  // APPROVE — only from 'requested' (idempotent, no duplicate approval).
  // Records approval timestamp + approving admin, sets the server-derived
  // 60-day expected return date, cancels any pending upgrade, and places
  // the member's financial activity on hold (hold is enforced by the
  // request_withdrawal / request_investment_upgrade RPCs via status).
  // ------------------------------------------------------------------
  if (action === "approve") {
    if (ret.status !== "requested") {
      return NextResponse.json(
        { error: `Return request is not approvable (status: ${ret.status}).` },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const expectedReturnDate = new Date(
      Date.now() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from("investment_returns")
      .update({
        status: "approved",
        approved_at: nowIso,
        approved_by: adminId,
        expected_return_date: expectedReturnDate,
      })
      .eq("id", returnId)
      .eq("status", "requested")
      .select("id");

    if (updateError) {
      return internalError("admin/returns", updateError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Return request was already processed." },
        { status: 409 }
      );
    }

    // Invariant: a pending upgrade must not survive into the hold state.
    const { data: cancelledUpgrades } = await supabase
      .from("investment_upgrades")
      .update({
        status: "cancelled",
        decided_by: adminId,
        decided_at: nowIso,
        decision_note:
          "Cancelled automatically: return investment was approved.",
      })
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id");

    for (const cu of cancelledUpgrades ?? []) {
      await supabase.from("financial_audit_log").insert({
        entity: "investment_upgrade",
        entity_id: cu.id,
        user_id: userId,
        actor_id: adminId,
        previous_status: "pending",
        new_status: "cancelled",
        amount: null,
        note: "cancelled due to return-investment approval",
      });
    }

    // Member in-app notification.
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Return Investment Approved",
      title_ur: "سرمایہ کاری واپسی منظور",
      message: APPROVAL_MSG_EN,
      message_ur: APPROVAL_MSG_UR,
      is_read: false,
    });

    // Member bilingual inbox message (exact spec wording).
    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: APPROVAL_MSG_EN,
      message_ur: APPROVAL_MSG_UR,
      is_read: false,
    });
    if (msgError) {
      return internalError("admin/returns", msgError);
    }

    // Audit trail.
    await supabase.from("financial_audit_log").insert({
      entity: "return_investment",
      entity_id: returnId,
      user_id: userId,
      actor_id: adminId,
      previous_status: "requested",
      new_status: "approved",
      amount: ret.amount,
      note: `approved by super admin; expected return ${expectedReturnDate}; financial hold active`,
    });

    return NextResponse.json({ success: true, status: "approved" });
  }

  // ------------------------------------------------------------------
  // REJECT — only from 'requested'.
  // ------------------------------------------------------------------
  if (action === "reject") {
    if (ret.status !== "requested") {
      return NextResponse.json(
        { error: `Return request cannot be rejected (status: ${ret.status}).` },
        { status: 409 }
      );
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("investment_returns")
      .update({ status: "rejected", approved_by: adminId })
      .eq("id", returnId)
      .eq("status", "requested")
      .select("id");
    if (updateError) {
      return internalError("admin/returns", updateError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Return request was already processed." },
        { status: 409 }
      );
    }

    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: "Your investment return request has been rejected.",
      message_ur: "آپ کی سرمایہ کاری واپسی کی درخواست مسترد کر دی گئی ہے۔",
      is_read: false,
    });
    if (msgError) {
      return internalError("admin/returns", msgError);
    }

    await supabase.from("financial_audit_log").insert({
      entity: "return_investment",
      entity_id: returnId,
      user_id: userId,
      actor_id: adminId,
      previous_status: "requested",
      new_status: "rejected",
      amount: ret.amount,
      note: "rejected by super admin",
    });

    return NextResponse.json({ success: true, status: "rejected" });
  }

  // ------------------------------------------------------------------
  // MARK COMPLETED — only from 'approved'. This records that the Super
  // Admin has ACTUALLY sent the money through the external application.
  // Approval alone never means paid.
  // ------------------------------------------------------------------
  if (action === "mark_completed") {
    if (ret.status !== "approved") {
      return NextResponse.json(
        {
          error: `Only an approved return can be marked as returned (status: ${ret.status}).`,
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from("investment_returns")
      .update({
        status: "completed",
        completed_at: nowIso,
        completed_by: adminId,
        returned_amount: ret.amount,
      })
      .eq("id", returnId)
      .eq("status", "approved")
      .select("id");

    if (updateError) {
      return internalError("admin/returns", updateError);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Return request was already completed." },
        { status: 409 }
      );
    }

    const completionMsgEn = `Your return investment has been completed. PKR ${amount} has been sent to your account.`;
    const completionMsgUr = `آپ کی سرمایہ کاری واپسی مکمل ہو گئی ہے۔ ${amount} روپے آپ کے اکاؤنٹ میں بھیج دیے گئے ہیں۔`;

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Investment Returned",
      title_ur: "سرمایہ کاری واپس",
      message: completionMsgEn,
      message_ur: completionMsgUr,
      is_read: false,
    });

    const { error: msgError } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "system",
      message: completionMsgEn,
      message_ur: completionMsgUr,
      is_read: false,
    });
    if (msgError) {
      return internalError("admin/returns", msgError);
    }

    await supabase.from("financial_audit_log").insert({
      entity: "return_investment",
      entity_id: returnId,
      user_id: userId,
      actor_id: adminId,
      previous_status: "approved",
      new_status: "completed",
      amount: ret.amount,
      note: "super admin confirmed real-world payout of returned principal",
    });

    return NextResponse.json({ success: true, status: "completed" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}