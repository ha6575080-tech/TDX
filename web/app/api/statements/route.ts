import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, username, mobile_number, city, status, created_at")
    .eq("id", user!.id)
    .single();

  const { data: deposits } = await supabaseAdmin
    .from("deposits")
    .select("id, amount, status, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const { data: payouts } = await supabaseAdmin
    .from("payouts")
    .select("id, amount, percentage_applied, month, year, status, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const { data: withdrawals } = await supabaseAdmin
    .from("withdrawals")
    .select("id, amount, status, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const totalDeposited = (deposits || [])
    .filter((d: { status: string; amount: number }) => d.status === "approved")
    .reduce((s: number, d) => s + d.amount, 0);
  const totalPayouts = (payouts || [])
    .filter((p: { status: string; amount: number }) => p.status === "paid")
    .reduce((s: number, p) => s + p.amount, 0);
  const totalWithdrawn = (withdrawals || [])
    .filter((w: { status: string; amount: number }) =>
      ["approved", "completed"].includes(w.status)
    )
    .reduce((s: number, w) => s + w.amount, 0);

  return NextResponse.json({
    profile,
    deposits: deposits || [],
    payouts: payouts || [],
    withdrawals: withdrawals || [],
    summary: { totalDeposited, totalPayouts, totalWithdrawn },
  });
}