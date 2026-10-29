import webpush from "web-push";
import { isTrustedPushEndpoint } from "@/lib/request-validation";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:ha6575080@gmail.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

/**
 * A push subscription stored across the three normalized columns
 * (endpoint / p256dh / auth) rather than as a single JSON blob.
 */
export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Reconstruct a web-push PushSubscription from the stored columns. */
export function buildPushSubscription(
  s: StoredSubscription
): webpush.PushSubscription {
  return {
    endpoint: s.endpoint,
    keys: { p256dh: s.p256dh, auth: s.auth },
  } as webpush.PushSubscription;
}

/** Send a payload to a list of stored subscriptions, tolerating expiry. */
export async function sendPushToSubscriptions(
  subs: StoredSubscription[],
  payload: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    if (!isTrustedPushEndpoint(s.endpoint)) {
      failed += 1;
      continue;
    }
    try {
      await webpush.sendNotification(buildPushSubscription(s), payload, { timeout: 10_000 });
      sent += 1;
    } catch {
      // subscription expired / unreachable — ignore
      failed += 1;
    }
  }
  return { sent, failed };
}
