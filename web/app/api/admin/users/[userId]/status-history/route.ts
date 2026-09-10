import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";

/**
 * GET /api/admin/users/:userId/status-history
 *
 * Admin-only audit trail of member status changes (previous -> new status,
 * who changed it, when, optional reason).
 *
 * SECURITY: the audit table has deny-by-default RLS and revoked client
 * grants, so this endpoint (service role) is the ONLY way the rows are
 * reachable — and only after requireAdmin() verifies the CALLER's own
 * profiles.role = 'admin'. Members can never read it: there is no
 * member-facing route that touches member_status_changes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);

  const supabase = await createServiceRoleClient();

  const { data: rows, error: rowsError } = await supabase
    .from("member_status_changes")
    .select(
      "id, member_id, previous_status, new_status, changed_by, reason, created_at"
    )
    .eq("member_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (rowsError) {
    return internalError("admin/users/status-history", rowsError);
  }

  // Resolve actor names for the admin UI (best-effort; never blocks the list).
  const actorIds = [...new Set((rows ?? []).map((r) => r.changed_by))];
  const actorMap = new Map<string, { name: string; username: string }>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .in("id", actorIds);
    for (const a of actors ?? []) {
      actorMap.set(a.id, {
        name: a.full_name ?? "",
        username: a.username ?? "",
      });
    }
  }

  const changes = (rows ?? []).map((r) => ({
    id: r.id,
    previous_status: r.previous_status,
    new_status: r.new_status,
    changed_by: r.changed_by,
    changed_by_name: actorMap.get(r.changed_by)?.name || "Admin",
    changed_by_username: actorMap.get(r.changed_by)?.username || "",
    reason: r.reason ?? null,
    created_at: r.created_at,
  }));

  return NextResponse.json({ user_id: userId, changes });
}
