import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Trusted admin authorization.
 *
 * The ONLY source of admin authority is the server-side profiles.role column
 * (constrained by the DB CHECK to 'user' | 'admin'), evaluated for the
 * CALLER's own row via the user-scoped client. No hardcoded email and no
 * client-supplied or user-editable metadata is ever trusted.
 */
export async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user.id;
}

// Guard helper for admin routes. Returns the authenticated admin user,
// or a 403 NextResponse if the user is not logged in / not an admin.
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}