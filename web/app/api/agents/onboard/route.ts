import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { internalError, logServerError } from "@/lib/api-errors";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  // Verify this user is an agent
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (!profile || profile.role !== "agent") {
    return NextResponse.json({ error: "Only agents can onboard members" }, { status: 403 });
  }

  const body = await req.json();
  const {
    full_name, mobile_number, whatsapp_number,
    address, city, invested_amount, picture_url,
    payment_method, account_number
  } = body as Record<string, string>;

  if (!full_name || !mobile_number || !invested_amount) {
    return NextResponse.json({ error: "full_name, mobile_number, and invested_amount are required" }, { status: 400 });
  }

  // Create a new user account for the member
  const tempEmail = `member_${mobile_number}@tdx-auto.com`;
  const tempPassword = Math.random().toString(36).slice(-10) + "A1!";

  const { data: authData, error: signUpErr } = await supabaseAdmin.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
    // Mirrored into profiles by the handle_new_user() trigger as a baseline;
    // the explicit upsert below finalises every field.
    user_metadata: {
      full_name,
      mobile_number,
      address: address ?? "",
      city: city ?? "",
      account_number: account_number ?? "",
      payment_method: payment_method ?? "EASYPAISA",
    },
  });

  if (signUpErr) {
    logServerError("agents/onboard", signUpErr, "create member account failed");
    return NextResponse.json({ error: "Failed to create member account" }, { status: 500 });
  }

  // Create/update profile. The handle_new_user() trigger may already have
  // inserted a baseline row when the auth user was created, so upsert.
  const username = `user_${mobile_number.slice(-6)}`;
  const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
    id: authData.user!.id,
    full_name,
    mobile_number,
    whatsapp_number: whatsapp_number || null,
    address: address || "-",
    city: city || "-",
    profile_picture_url: picture_url || null,
    payment_method: payment_method || "EASYPAISA",
    account_number: account_number || "N/A",
    username,
    role: "user",
    is_active: true,
    referred_by: user!.id,
    agent_id: user!.id,
  });

  if (profileErr) {
    logServerError("agents/onboard", profileErr, "create member profile failed");
    return NextResponse.json({ error: "Failed to create member profile" }, { status: 500 });
  }

  // Create deposit record
  const { error: depositErr } = await supabaseAdmin.from("deposits").insert({
    user_id: authData.user!.id,
    amount: parseFloat(invested_amount),
    receipt_image_url: "pending-upload",
    status: "pending",
    created_by_agent: user!.id,
  });

  if (depositErr) {
    logServerError("agents/onboard", depositErr, "create deposit record failed");
    return NextResponse.json({ error: "Failed to create deposit record" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Member onboarded successfully",
    member: { id: authData.user!.id, full_name, mobile_number, username },
  });
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  // Fetch members onboarded by this agent.
  // profiles has no `status` text column — derive it from the flags.
  const { data: members, error: qErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, mobile_number, whatsapp_number, city, is_active, is_suspended, created_at")
    .eq("agent_id", user!.id)
    .order("created_at", { ascending: false });

  if (qErr) return internalError("agents/onboard", qErr);

  const rows = (members || []).map((m) => {
    const rec = m as {
      id: string; full_name: string; mobile_number: string;
      whatsapp_number: string | null; city: string | null;
      is_active: boolean; is_suspended: boolean; created_at: string;
    };
    const status = rec.is_suspended ? "suspended" : rec.is_active ? "active" : "pending";
    return {
      id: rec.id,
      full_name: rec.full_name,
      mobile_number: rec.mobile_number,
      whatsapp_number: rec.whatsapp_number,
      city: rec.city,
      status,
      created_at: rec.created_at,
    };
  });

  return NextResponse.json({ members: rows });
}
