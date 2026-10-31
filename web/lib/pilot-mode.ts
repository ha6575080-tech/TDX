// Public registration must be explicitly enabled after the pilot is cleared.
// Supabase's hosted signup setting independently enforces invitation-only access.
export const PUBLIC_SIGNUP_ENABLED = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP === "true";
