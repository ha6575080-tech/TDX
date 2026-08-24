/**
 * TDX investment model constants — single source of truth for the
 * active product rules. The server ALWAYS re-validates these; UI values
 * are display/validation convenience only.
 *
 * Business model (Super Admin approved):
 *   - Investment amount: PKR 5,000 – 2,000,000 (no package selection).
 *   - Monthly profit: 7%–10%, selected ONLY by an authorized Super Admin.
 *   - Withdrawals pay monthly profit only; principal stays invested.
 *   - PKR 100 fee per completed monthly-profit withdrawal.
 */

export const MIN_INVESTMENT_PKR = 5_000;
export const MAX_INVESTMENT_PKR = 2_000_000;

/** Rates a Super Admin may select — nothing outside this list is accepted
 *  by the API route or by the database CHECK constraint. */
export const ALLOWED_MONTHLY_RATES = [7, 8, 9, 10] as const;
export type AllowedMonthlyRate = (typeof ALLOWED_MONTHLY_RATES)[number];

export const WITHDRAWAL_FEE_PKR = 100;

/** Where members send deposit payments (shown on the deposit form). */
export const PAYMENT_ACCOUNT = {
  accountName: "Saim",
  accountNumber: "0325-2879424",
  method: "EASYPAISA",
} as const;

/** Server-side guard mirroring the DB CHECK constraint. */
export function isAllowedMonthlyRate(v: unknown): v is AllowedMonthlyRate {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    (ALLOWED_MONTHLY_RATES as readonly number[]).includes(v)
  );
}