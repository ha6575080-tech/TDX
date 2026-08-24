"use client";

/**
 * DEPRECATED — do not use.
 *
 * This component previously inserted directly into `investment_returns`
 * from the browser. That client INSERT path has been removed at the
 * database level (RLS policy dropped) because members must never write
 * financial records directly.
 *
 * Use `ReturnInvestmentPanel` instead, which submits through the
 * server-authorized RPC (`request_return_investment`) via
 * POST /api/returns/request.
 */
export default function RequestInvestmentBack() {
  return null;
}