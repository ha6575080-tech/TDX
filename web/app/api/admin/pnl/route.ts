import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { internalError } from "@/lib/api-errors";
import { REPORT_PERIODS, reportStart, type ReportPeriod } from "@/lib/report-period";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const period = new URL(request.url).searchParams.get("period") ?? "monthly";
  if (!(REPORT_PERIODS as readonly string[]).includes(period)) return NextResponse.json({ error: "Invalid reporting period" }, { status: 400 });
  const now = new Date();
  const startDate = reportStart(period as ReportPeriod, now).toISOString();
  const client = await createServiceRoleClient();
  const { data, error: queryError } = await client.rpc("admin_cashflow_report", { p_start: startDate, p_end: now.toISOString() });
  if (queryError) return internalError("admin/pnl", queryError);
  if (!data || typeof data !== "object") return internalError("admin/pnl", new Error("Empty cashflow result"));
  return NextResponse.json({ ...data, period, startDate, endDate: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
