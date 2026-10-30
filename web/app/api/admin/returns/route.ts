import { relatedOne } from "@/lib/relations";
import { readJsonObject, isUuid } from "@/lib/request-validation";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createServiceRoleClient();

  const { data: returns, error: returnsError } = await supabase
    .from("investment_returns")
    .select(
      "id, user_id, amount, returned_amount, status, requested_at, approved_at, approved_by, completed_at, completed_by, expected_return_date, profiles!investment_returns_user_id_fkey(full_name, username, mobile_number)"
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  if (returnsError) {
    return internalError("admin/returns", returnsError);
  }

  const parsed = (returns ?? []).map((r) => ({
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
    fullName: relatedOne(r.profiles)?.full_name ?? "Unknown",
    username: relatedOne(r.profiles)?.username ?? "Unknown",
    mobile: relatedOne(r.profiles)?.mobile_number ?? "Unknown",
  }));

  return NextResponse.json({ returns: parsed });
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  let body: { returnId?: unknown; action?: unknown };
  try { body = await readJsonObject(request); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!isUuid(body.returnId) || typeof body.action !== "string" || !["approve", "reject", "mark_completed"].includes(body.action)) return NextResponse.json({ error: "A valid return request and action are required." }, { status: 400 });
  const client = await createServiceRoleClient();
  const { data, error: decisionError } = await client.rpc("admin_decide_return", { p_return: body.returnId, p_actor: user.id, p_action: body.action });
  if (decisionError) return internalError("admin/returns", decisionError);
  if (!data?.ok) return NextResponse.json({ error: data?.reason === "already_processed" ? "Return request was already processed. Refresh to see its current status." : "Return request could not be processed." }, { status: data?.reason === "not_found" ? 404 : data?.reason === "forbidden" ? 403 : 409 });
  return NextResponse.json({ success: true, status: data.status, expected_return_date: data.expected_return_date });
}
