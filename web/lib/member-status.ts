/**
 * MEMBER STATUS — single source of truth for the 3-state member account model.
 *
 * Reuses the EXISTING profiles fields (no duplicate status system):
 *   Suspended = is_suspended = true                    (is_active preserved)
 *   Active    = is_active = true  AND is_suspended = false
 *   Inactive  = is_active = false AND is_suspended = false
 *
 * IMPORTANT: account status is COMPLETELY INDEPENDENT from deposit/receipt
 * state. Nothing here (and no DB primitive) consults deposits, receipts,
 * approvals, payment methods or amounts. A freshly registered member with
 * zero deposits is suspendable immediately.
 */

export type MemberStatus = "active" | "inactive" | "suspended";

export const MEMBER_STATUSES: readonly MemberStatus[] = [
  "active",
  "inactive",
  "suspended",
];

export function isMemberStatus(v: unknown): v is MemberStatus {
  return v === "active" || v === "inactive" || v === "suspended";
}

/**
 * Derive the member's account status from the two existing profile booleans.
 * Suspension always takes display precedence (a suspended member with a
 * previously-approved deposit still shows as Suspended).
 */
export function deriveMemberStatus(
  profile: Pick<{ is_active: boolean; is_suspended: boolean },
    "is_active" | "is_suspended"> | null | undefined
): MemberStatus {
  if (!profile) return "inactive";
  if (profile.is_suspended) return "suspended";
  if (profile.is_active) return "active";
  return "inactive";
}

/**
 * Profile flag payload that produces the requested status.
 *
 *  - "suspended": flips ONLY is_suspended. is_active is deliberately NOT
 *    included, so the member's financial-activation state (and every
 *    financial record) is preserved — reactivation restores it.
 *  - "active":    is_active = true,  is_suspended = false
 *  - "inactive":  is_active = false, is_suspended = false
 */
export function statusToProfileFlags(
  status: MemberStatus
): { is_active?: boolean; is_suspended: boolean } {
  switch (status) {
    case "suspended":
      return { is_suspended: true };
    case "active":
      return { is_active: true, is_suspended: false };
    case "inactive":
      return { is_active: false, is_suspended: false };
  }
}
