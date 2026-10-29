/** Reject JSON scalars and arrays before route handlers access body fields. */
export async function readJsonObject<T extends object>(request: Request): Promise<T> {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a JSON object");
  }
  return body as T;
}

/** Private evidence files have exactly one filename inside the owner's folder. */
export function isOwnedObjectPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || path.length > 512 || !path.startsWith(`${userId}/`)) return false;
  const filename = path.slice(userId.length + 1);
  return filename.length > 0 && filename !== "." && filename !== ".." &&
    !/[\/\\%\x00-\x1f\x7f]/.test(filename);
}

export function isPastOrPresentDate(value: unknown, today: string): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today;
}

/** Restrict outbound push requests to browser push providers, including legacy rows. */
export function isTrustedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port) return false;
    return ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) ||
      url.hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}
