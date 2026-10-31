import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readJsonObject } from "@/lib/request-validation";
import { isStrongPassword } from "@/lib/password-policy";

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: { currentPassword?: unknown; newPassword?: unknown };
  try { body = await readJsonObject(request); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.currentPassword !== "string" || !body.currentPassword || body.currentPassword.length > 1024 || !isStrongPassword(body.newPassword)) {
    return NextResponse.json({ error: "Enter your current password and a new password of at least 12 characters. Shorten it if it is too long.", code: "invalid_password" }, { status: 400 });
  }
  if (body.currentPassword === body.newPassword) {
    return NextResponse.json({ error: "Choose a different new password.", code: "same_password" }, { status: 400 });
  }
  if (!user.email) return NextResponse.json({ error: "Please contact support to change this account's password." }, { status: 409 });

  try {
    const supabase = await createClient();
    // Explicitly verify the current password, even when the provider setting
    // requiring it has not been enabled. Identity comes from the live session.
    const verified = await supabase.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
    if (verified.error || verified.data.user?.id !== user.id) {
      return NextResponse.json({ error: "Your current password could not be verified. Check it and try again.", code: "current_password_invalid" }, { status: 400 });
    }
    const updated = await supabase.auth.updateUser({ password: body.newPassword, current_password: body.currentPassword });
    if (updated.error) {
      const limited = ["over_request_rate_limit", "over_email_send_rate_limit"].includes(updated.error.code ?? "");
      return NextResponse.json({ error: "Your password could not be changed. Please try again or contact support.", code: "password_update_failed" }, { status: limited ? 429 : 400 });
    }
    // Keep this newly verified session; revoke refresh access on other devices.
    // Existing access tokens may remain valid until their provider expiry.
    const signedOut = await supabase.auth.signOut({ scope: "others" }).catch(() => ({ error: true }));
    return NextResponse.json({ success: true, otherSessionsSignedOut: !signedOut.error });
  } catch {
    return NextResponse.json({ error: "The password change could not be confirmed. Try signing in again or contact support.", code: "password_change_unconfirmed" }, { status: 503 });
  }
}
