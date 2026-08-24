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

  return { user, error: null };
}