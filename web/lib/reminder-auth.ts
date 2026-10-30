import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export function validReminderAuthorization(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  // Vercel's daily fallback supplies a bearer credential. The frequent worker
  // supplies an expiring signature so pg_net never queues the actual secret.
  const supplied = Buffer.from(authorization);
  const bearer = Buffer.from(`Bearer ${secret}`);
  if (supplied.length === bearer.length && timingSafeEqual(supplied, bearer)) return true;
  const match = /^TDX-HMAC ([0-9]{10})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(authorization);
  if (!match || Math.abs(Date.now() / 1000 - Number(match[1])) > 120) return false;
  const url = new URL(request.url);
  const payload = `${request.method}:${url.pathname}${url.search}:${match[1]}:${match[2]}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(match[3], "hex"));
}
