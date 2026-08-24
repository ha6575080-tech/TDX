import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

interface PushSub {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * POST /api/push/subscribe
 *
 * Stores a normalized push subscription (endpoint / p256dh / auth) for the
 * authenticated user. The client never supplies a user_id — it is taken from
 * the session. The unique constraint (user_id, endpoint) makes this idempotent.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: { subscription?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sub = (body.subscription ?? {}) as PushSub;

  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      {
        error:
          "subscription with endpoint, keys.p256dh and keys.auth is required",
      },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  const { error: upsertError } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      { onConflict: "user_id,endpoint" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}