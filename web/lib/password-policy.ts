/** Shared policy for newly chosen passwords; existing sign-in is unchanged. */
export function passwordPolicyError(value: unknown): "too_short" | "too_long" | null {
  if (typeof value !== "string" || Array.from(value).length < 12) return "too_short";
  return new TextEncoder().encode(value).length > 72 ? "too_long" : null;
}

export function isStrongPassword(value: unknown): value is string {
  return passwordPolicyError(value) === null;
}
