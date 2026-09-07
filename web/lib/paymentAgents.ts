/**
 * Payment Agents — authoritative cash-agent configuration
 *
 * Requirement: Do not hard-code "Shakeela" into ten components.
 * This file is the single source of truth for cash-agent display.
 * DB table payment_agents is the extensible store; this constant
 * provides the current active set for UI fallbacks and server validation.
 *
 * Adding a new authorized agent:
 *   1. Insert into payment_agents (name, is_active=true)
 *   2. Add entry here (or fetch dynamically from /api/payment-agents)
 * No redesign of deposit workflow is required.
 */

export interface PaymentAgent {
  id?: string; // uuid when fetched from DB, optional for static fallback
  name: string;
  isActive: boolean;
}

/** Current active cash agents — members only see ACTIVE entries */
export const PAYMENT_AGENTS: PaymentAgent[] = [
  { name: "Shakeela", isActive: true },
];

/** Active agent names for validation / display */
export const ACTIVE_AGENT_NAMES = PAYMENT_AGENTS.filter((a) => a.isActive).map((a) => a.name);

/** Check if a name is an authorized active agent (case-sensitive) */
export function isActiveAgent(name: string): boolean {
  return ACTIVE_AGENT_NAMES.includes(name);
}

/** Display helper for badges */
export function paymentMethodLabel(method: string): string {
  if (method === "online_transfer") return "ONLINE TRANSFER";
  if (method === "cash_agent") return "CASH TO AGENT";
  return method.toUpperCase();
}
