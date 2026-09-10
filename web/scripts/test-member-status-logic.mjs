/**
 * UNIT TESTS — member status model (pure logic, no DB / no network).
 *
 * Run:  node web/scripts/test-member-status-logic.mjs
 *
 * Covers the 3-state model shared by the DB RPC (set_member_status),
 * the admin API and every UI badge:
 *   Suspended = is_suspended = true              (is_active preserved)
 *   Active    = is_active = true  AND is_suspended = false
 *   Inactive  = is_active = false AND is_suspended = false
 *
 * And the DEPOSIT-INDEPENDENCE invariants:
 *   * flag payloads never reference deposits/receipts/approvals;
 *   * suspending a financially-active member preserves is_active, so
 *     reactivation restores the prior state;
 *   * a brand-new member (is_active=false) is suspendable like any other.
 */
import {
  deriveMemberStatus,
  isMemberStatus,
  MEMBER_STATUSES,
  statusToProfileFlags,
} from "../lib/member-status.ts";

let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(
      `  FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`
    );
  }
}

console.log("== deriveMemberStatus — the 3-state model ==");
check("active:    is_active=true,  is_suspended=false -> active",
  deriveMemberStatus({ is_active: true, is_suspended: false }), "active");
check("inactive:  is_active=false, is_suspended=false -> inactive",
  deriveMemberStatus({ is_active: false, is_suspended: false }), "inactive");
check("suspended: is_active=false, is_suspended=true  -> suspended",
  deriveMemberStatus({ is_active: false, is_suspended: true }), "suspended");
check("suspended (display precedence): is_active=true, is_suspended=true -> suspended",
  deriveMemberStatus({ is_active: true, is_suspended: true }), "suspended");
check("null profile -> inactive (safe default)",
  deriveMemberStatus(null), "inactive");
check("undefined profile -> inactive (safe default)",
  deriveMemberStatus(undefined), "inactive");

console.log("\n== statusToProfileFlags — server update payloads ==");
check("active flags",
  statusToProfileFlags("active"), { is_active: true, is_suspended: false });
check("inactive flags",
  statusToProfileFlags("inactive"), { is_active: false, is_suspended: false });
check("suspended flags flip ONLY is_suspended (is_active deliberately absent)",
  statusToProfileFlags("suspended"), { is_suspended: true });

console.log("\n== isMemberStatus — input validation ==");
check("'active' accepted", isMemberStatus("active"), true);
check("'inactive' accepted", isMemberStatus("inactive"), true);
check("'suspended' accepted", isMemberStatus("suspended"), true);
check("'deleted' rejected", isMemberStatus("deleted"), false);
check("'' rejected", isMemberStatus(""), false);
check("null rejected", isMemberStatus(null), false);
check("'ADMIN' (case) rejected", isMemberStatus("ADMIN"), false);
check("MEMBER_STATUSES is exactly the 3 states",
  [...MEMBER_STATUSES].sort(), ["active", "inactive", "suspended"].sort());

console.log("\n== Invariants — suspend preserves financial state ==");
// Member with an approved deposit (financially active) gets suspended:
// is_active must be PRESERVED, and reactivation must restore Active.
const withApprovedDeposit = { is_active: true, is_suspended: false };
const suspended = {
  ...withApprovedDeposit,
  ...statusToProfileFlags("suspended"),
};
check("suspension preserves is_active", suspended.is_active, true);
check("suspension sets is_suspended", suspended.is_suspended, true);
check("derived status after suspend", deriveMemberStatus(suspended), "suspended");
const reactivated = { ...suspended, ...statusToProfileFlags("active") };
check("reactivation restores active state", deriveMemberStatus(reactivated), "active");
check("reactivation restores is_active=true", reactivated.is_active, true);

// Brand-new member (zero deposits): suspendable immediately, and
// deactivation works on it too.
const freshMember = { is_active: false, is_suspended: false };
check("fresh member derives inactive", deriveMemberStatus(freshMember), "inactive");
const freshSuspended = { ...freshMember, ...statusToProfileFlags("suspended") };
check("fresh member (zero deposits) is suspendable", deriveMemberStatus(freshSuspended), "suspended");
const freshInactive = { ...freshMember, ...statusToProfileFlags("inactive") };
check("fresh member stays inactive on deactivate", deriveMemberStatus(freshInactive), "inactive");

// No status is a no-op trap: every target from every state resolves to
// itself after applying its flags (idempotent server mapping).
for (const from of [
  { is_active: true, is_suspended: false },
  { is_active: false, is_suspended: false },
  { is_active: true, is_suspended: true },
  { is_active: false, is_suspended: true },
]) {
  for (const target of MEMBER_STATUSES) {
    const applied = { ...from, ...statusToProfileFlags(target) };
    check(`apply ${target} from ${JSON.stringify(from)} -> ${target}`,
      deriveMemberStatus(applied), target);
  }
}

console.log(
  `\n${passed} passed, ${failed} failed` +
    (failures.length ? `\nFAILED: ${failures.join(" | ")}` : "")
);
process.exit(failed === 0 ? 0 : 1);
