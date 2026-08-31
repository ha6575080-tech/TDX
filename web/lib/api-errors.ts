import { NextResponse } from "next/server";

/**
 * Server-side diagnostics that NEVER write raw error messages, objects,
 * details/hint, stacks, request bodies, or client-supplied values to the
 * log stream.
 *
 * WHY: Supabase error objects routinely embed user-supplied PII in their
 * `message` / `details` / `hint` fields (e.g. `duplicate key value violates
 * unique constraint "profiles_username_key"` contains the raw username;
 * check-constraint messages embed phone numbers). Logging the complete
 * object would therefore write PII/secrets into server logs.
 *
 * We log ONLY:
 *   scope, error type, safe error code (SQLSTATE / auth code),
 *   coarse classification, timestamp.
 * No message, no details, no hint, no stack, no request body.
 */

const GENERIC_500 = "Internal server error";

/**
 * Correlation ID: timestamp + random suffix, NO user data, NO request data.
 * Safe to return to the client and to include in the server log entry so an
 * operator can match a user-reported failure to its diagnostic record.
 */
export function newCorrelationId(): string {
  return `err_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function errorType(err: unknown): string {
  if (err === null) return "null";
  if (err === undefined) return "undefined";
  if (typeof err === "string") return "string";
  if (err instanceof Error) return err.name || "Error";
  if (typeof err === "object") {
    const name = (err as { name?: unknown }).name;
    return typeof name === "string" && name ? name : "object";
  }
  return typeof err;
}

export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && c) return c;
  }
  return undefined;
}

function classify(code: string | undefined): string {
  switch (code) {
    case "23505":
      return "unique_violation";
    case "23503":
      return "foreign_key_violation";
    case "23502":
      return "not_null_violation";
    case "23514":
      return "check_constraint_violation";
    case "23519":
      return "array_subscript";
    case "42501":
      return "permission_denied";
    case "42P01":
      return "undefined_table";
    case "22P02":
      return "invalid_input_syntax";
    case "22P05":
      return "untranslatable_char";
    case "user_already_exists":
    case "invalid_credentials":
    case "email_exists":
    case "weak_password":
    case "over_email_send_rate_limit":
    case "otp_expired":
      return "auth_error";
    default:
      return code ? "db_or_service_error" : "unknown";
  }
}

type LogLevel = "error" | "warn";

function logEntry(level: LogLevel, scope: string, err: unknown, context?: string): void {
  const code = errorCode(err);
  const entry = {
    level,
    scope,
    errorType: errorType(err),
    code,
    classification: classify(code),
    at: new Date().toISOString(),
  };
  const payload = context ? { context, ...entry } : entry;
  const fn = level === "error" ? console.error : console.warn;
  fn(`[api:${scope}]`, payload);
}

/** Structured server-side error log (safe fields only). */
export function logServerError(scope: string, err: unknown, context?: string): void {
  logEntry("error", scope, err, context);
}

/** Structured server-side warning log (safe fields only). */
export function logServerWarn(scope: string, err: unknown, context?: string): void {
  logEntry("warn", scope, err, context);
}

/**
 * Uniform 500 response for API routes. Clients receive a generic message plus
 * a correlation ID (no internals); safe, structured diagnostic fields
 * (scope/code/type/classification — no message) go to the server log only.
 */
export function internalError(scope: string, err: unknown): NextResponse {
  const correlationId = newCorrelationId();
  logServerError(scope, err, `correlationId=${correlationId}`);
  return NextResponse.json(
    { error: GENERIC_500, correlationId },
    { status: 500 }
  );
}

/**
 * HTML-escape untrusted (user-supplied) values before interpolating them into
 * email HTML or other non-React HTML output. Escapes &, <, >, " and '.
 */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}