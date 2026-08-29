/**
 * Safe, structured error extraction for Supabase errors.
 *
 * The goal is to turn opaque error values (PostgrestError, AuthApiError,
 * plain objects, strings) into { message, code, details, hint, friendly }
 * without ever rendering raw internals, SQL, tokens, or secrets to users.
 *
 * - `friendly` is always safe for the UI (generic, human-readable).
 * - `code` / `details` / `hint` are for console diagnostics only.
 */

export interface SafeErrorInfo {
  /** Low-level message if one exists and is presentable (never a raw stack/SQL). */
  message: string;
  /** Short machine code (e.g. 23505, 42501, user_already_exists). */
  code?: string;
  /** Answer to "failed and why" style hints (log-only). */
  detail?: string;
  hint?: string;
  /** Always-safe message for the UI. */
  friendly: string;
}

const GENERIC = "An unexpected error occurred. Please try again.";

/** Map select known failure codes to safe user-facing copy. */
function friendlyForCode(code: string, fallback: string): string {
  switch (code) {
    case "23505":
      return "That username or referral code is already in use. A fresh variation was generated — if you still see this, please change your username.";
    case "42501":
    case "42503":
      return "Your account was created, but a security check blocked a profile update. Please log in — your details were saved from your registration.";
    case "23514":
      return "Some profile details could not be saved because they don't match the expected format. Please review your phone number and payment method.";
    case "23502":
      return "Some required profile details were missing. Please fill in every field and try again.";
    case "22P02":
    case "22P05":
      return "One of the entered values is not in the expected format. Please check your phone number and username.";
    case "user_already_exists":
      return "An account with this phone/email already exists.";
    default:
      return fallback;
  }
}

/** Extract structured info from any thrown value. Never throws. */
export function extractErrorInfo(err: unknown, fallback = GENERIC): SafeErrorInfo {
  // Error-like objects first (PostgrestError extends Error and carries
  // message/code/details/hint; AuthApiError carries message/status/code).
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const code = typeof e.code === "string" && e.code ? e.code : undefined;
    const detail = typeof e.details === "string" && e.details ? e.details : undefined;
    const hint = typeof e.hint === "string" && e.hint ? e.hint : undefined;
    const raw = typeof e.message === "string" ? e.message : undefined;
    const message =
      raw && raw !== "[object Object]" && !raw.includes("(\n<") ? raw : undefined;

    if (message || code || detail) {
      const friendly = message
        ? code
          ? friendlyForCode(code, message)
          : message
        : code
        ? friendlyForCode(code, fallback)
        : fallback;
      return { message: message ?? fallback, code, detail, hint, friendly };
    }

    // Plain object with no usable fields — avoid "[object Object]".
  }

  if (err instanceof Error) {
    const m = err.message;
    if (m && m !== "[object Object]") return { message: m, friendly: m };
  }

  if (typeof err === "string" && err.trim() !== "") return { message: err, friendly: err };

  return { message: fallback, friendly: fallback };
}

/** Alias for call sites that only need a safe string. */
export function safeErrorMessage(err: unknown, fallback = GENERIC): string {
  return extractErrorInfo(err, fallback).friendly;
}