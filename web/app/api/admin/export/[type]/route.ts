import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { type } = await params;
  const supabase = await createServiceRoleClient();

  let rows: Record<string, unknown>[] = [];
  let filename = "export.csv";

  if (type === "users") {
    const { data } = await supabase
      .from("profiles")
      .select(
        "full_name, username, city, address, mobile_number, account_number, payment_method, is_active, is_suspended, created_at, profit_activation_date"
      )
      .order("created_at", { ascending: false });
    rows = (data ?? []).map((u: any) => ({
      "Full Name": u.full_name ?? "",
      Username: u.username ?? "",
      City: u.city ?? "",
      Address: u.address ?? "",
      Mobile: u.mobile_number ?? "",
      Account: u.account_number ?? "",
      Payment: u.payment_method ?? "",
      Status: u.is_suspended ? "Suspended" : u.is_active ? "Active" : "Inactive",
      Registered: u.created_at ?? "",
      "Profit On": u.profit_activation_date ?? "",
    }));
    filename = "users.csv";
  } else if (type === "deposits") {
    // NOTE: no profiles(...) embed — deposits has TWO foreign keys to profiles
    // (user_id and created_by_agent), so PostgREST cannot infer the relationship.
    // Profiles are fetched explicitly below using each trusted deposit.user_id.
    const { data } = await supabase
      .from("deposits")
      .select(
        "user_id, amount, status, ai_verdict, ai_confidence, uploaded_at, packages(package_name)"
      )
      .order("uploaded_at", { ascending: false });

    const depRows = data ?? [];
    const userIds = [...new Set(depRows.map((d: any) => d.user_id))];
    const profileMap = new Map<string, Record<string, unknown>>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, mobile_number")
        .in("id", userIds);
      for (const p of profiles ?? []) profileMap.set(p.id, p);
    }

    rows = depRows.map((d: any) => {
      const u = profileMap.get(d.user_id) ?? {};
      return {
      "Full Name": u.full_name ?? "",
      Username: u.username ?? "",
      Mobile: u.mobile_number ?? "",
      Amount: d.amount ?? 0,
      Package: d.packages?.package_name ?? "",
      Status: d.status ?? "",
      "AI Verdict": d.ai_verdict ?? "",
      "AI Confidence": d.ai_confidence ?? 0,
      Date: d.uploaded_at ?? "",
      }
    });
    filename = "deposits.csv";
  } else if (type === "withdrawals") {
    const { data } = await supabase
      .from("withdrawals")
      .select(
        "amount, fee, net_amount, status, requested_at, profiles(full_name, username, mobile_number)"
      )
      .order("requested_at", { ascending: false });
    rows = (data ?? []).map((w: any) => ({
      "Full Name": w.profiles?.full_name ?? "",
      Username: w.profiles?.username ?? "",
      Mobile: w.profiles?.mobile_number ?? "",
      Amount: w.amount ?? 0,
      Fee: w.fee ?? 0,
      Net: w.net_amount ?? 0,
      Status: w.status ?? "",
      "Requested At": w.requested_at ?? "",
    }));
    filename = "withdrawals.csv";
  } else if (type === "payouts") {
    const { data } = await supabase
      .from("profits")
      .select(
        "month, year, amount, status, payout_date, profiles(full_name, username)"
      )
      .order("payout_date", { ascending: true });
    rows = (data ?? []).map((p: any) => ({
      "Full Name": p.profiles?.full_name ?? "",
      Username: p.profiles?.username ?? "",
      Amount: p.amount ?? 0,
      Month: p.month ?? "",
      Year: p.year ?? "",
      Status: p.status ?? "",
      "Payout Date": p.payout_date ?? "",
    }));
    filename = "payouts.csv";
  } else {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}