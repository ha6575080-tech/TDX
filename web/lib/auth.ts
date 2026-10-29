import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guard helper for user routes. Returns the authenticated user,
// or a 401 NextResponse if not logged in.
export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  // Recheck account control on every API request, including existing sessions.
  // A missing/unreadable profile must not grant access to privileged writes.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return {
      user: null,
      error: NextResponse.json({ error: "Account access could not be verified. Please try again." }, { status: 503 }),
    };
  }
  if (profile.is_suspended && profile.role !== "admin") {
    return {
      user: null,
      error: NextResponse.json({ error: "account_suspended" }, { status: 403 }),
    };
  }

  return { user, error: null };
}
