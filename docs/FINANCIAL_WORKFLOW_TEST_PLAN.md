# TDX Financial Workflow — Dedicated Test Member Plan

**Purpose:** Validate the three financial lifecycles end-to-end with a single
dedicated test member. **Not yet executed** — this document is the runbook.
All steps use the real UI (member dashboard + admin panel) so notifications,
inbox messages, and audit entries are exercised exactly as in production.

## Setup

1. Register a test member via `/register`:
   - username: `tdx-test-01` (or similar), WhatsApp number: any valid
     `03XXXXXXXXX`
   - (The live-selfie step has been removed from registration.)
2. As Super Admin, approve the member's deposit(s) so the member has an
   APPROVED investment. Recommended amounts for clean math:
   - Deposit A: **PKR 500,000** (this becomes the active investment)
3. Confirm in DB (read-only): `profiles.profit_activation_date` is set for the
   member (or note the earliest approved deposit timestamp — the 30-day anchor).
   If you want to test withdrawals immediately, set `profit_activation_date`
   back-dated >30 days via SQL Editor (single UPDATE on the test profile only).

> Every lifecycle below lists the exact records created and the exact
> `financial_audit_log` rows that must appear. Verify with:
>
> ```sql
> select * from financial_audit_log where user_id = '<TEST_USER_ID>' order by id;
> ```

---

## Lifecycle 1 — Withdrawal request → admin completion

| Step | Actor | Action |
| --- | --- | --- |
| 1 | Member | Dashboard → Withdraw → amount **PKR 5,000** → submit |
| 2 | Member | Observe success message + confirmation notification/inbox |
| 3 | Admin | Admin Panel → Withdrawals → Mark Completed |

### Records created — withdrawal

- `withdrawals`: 1 row — user_id=TEST, amount=5000, fee=100, net_amount=4900,
  status transitions pending→completed, requested_at + processed_at.
- `notifications`: member confirmation ("Withdrawal Request Received") + admin
  notification ("New Withdrawal Request").
- `messages`: member bilingual confirmation.

### Expected `financial_audit_log` entries — withdrawal

1. entity=`withdrawal`, new_status=`pending`, actor=TEST member, amount=5000,
   note contains "request_withdrawal()".
2. entity=`withdrawal`, previous_status=`pending`, new_status=`completed`,
   actor=<ADMIN_ID>, amount=5000.
   *(If the admin completion's audit insert is added later, verify entry 1
   exists today; admin-side completion currently uses processed_at/status — see
   note at bottom.)*

**Also verify:** member balance math (500,000 − 5,000 reserved→spent); second
submission of identical request succeeds independently (no duplicate-block on
withdrawals by design).

---

## Lifecycle 2 — Return Investment request → approval → mark returned

| Step | Actor | Action |
| --- | --- | --- |
| 1 | Member | Dashboard → Return Investment → submit |
| 2 | Member | Confirmation notification/inbox; panel shows status=requested, amount=500,000 |
| 3 | Member (negative test) | Attempt Withdraw → must be rejected (`return_request_pending`) |
| 4 | Admin | Returns tab → Approve |
| 5 | Member | Panel shows approved + expected return date (+60 days); hold banner replaces Withdraw form; exact EN/UR approval message in inbox |
| 6 | Member (negative tests) | Attempt Withdraw → rejected (`return_investment_hold`); attempt Upgrade → rejected (`return_investment_hold`) |
| 7 | Admin | After "sending" money externally (simulate; no real transfer needed for a test member) → Mark Investment Returned |
| 8 | Member | Panel shows completed + returned amount/date; hold banner gone; withdraw form returns |

### Records created — return investment

- `investment_returns`: 1 row — amount=500,000, status
  requested→approved→completed, approved_at/by, expected_return_date =
  approved_at+60d, completed_at/by, returned_amount=500,000.
- `notifications`: member ×3 (received / approved / returned) + admin
  notification per step.
- `messages`: member bilingual ×3 (exact spec text for approval).
- `financial_audit_log` expected entries:
  1. entity=`return_investment`, new_status=`requested`, actor=TEST,
     amount=500000.
  2. entity=`return_investment`, prev=`requested`, new=`approved`, actor=ADMIN,
     amount=500000, note mentions expected date + hold.
  3. entity=`return_investment`, prev=`approved`, new=`completed`, actor=ADMIN,
     amount=500000.

### Negative checks — return lifecycle

- Duplicate return request while unresolved → rejected (409
  duplicate_unresolved_request).
- New withdrawal while return requested/approved → rejected.
- New upgrade while approved → rejected.

---

## Lifecycle 3 — Investment upgrade → activation after next payout/withdrawal

Run AFTER Lifecycle 2 completes (hold removed). Two variants:

### Variant A — activate after next WITHDRAWAL

| Step | Actor | Action |
| --- | --- | --- |
| 1 | Member | Upgrade Investment → enter **PKR 800,000** → observe Previous/New/Increase preview (500k/800k/300k) → submit |
| 2 | Member | Pending block appears; current cycle still uses 500,000 everywhere |
| 3 | Member (negative tests) | Submit upgrade again → 409 duplicate_pending_upgrade; enter 400,000 → rejected invalid_upgrade |
| 4 | Admin | Complete a NEW small withdrawal (e.g. PKR 1,000) for the member |
| 5 | Member | Upgrade-active notification + inbox; dashboard active investment now 800,000 |

### Variant B — activate after next PAID PROFIT (alternative)

Same but step 4 = Admin marks a pending monthly profit as paid instead.

### Records created — upgrade

- `investment_upgrades`: 1 row — previous_amount=500000,
  requested_amount=800000, increase_amount=300000, status pending→active,
  activated_after_entity=`withdrawal`(A)/`payout`(B) + entity id, activated_at.
- `withdrawals` (Variant A): 1 extra completed row (amount=1000).
- `notifications`/`messages`: member received + activated messages; admin
  notified at request time.
- `financial_audit_log` expected entries:
  1. entity=`investment_upgrade`, new_status=`pending`, actor=TEST,
     amount=800000, note "upgrade requested: 500000 -> 800000".
  2. entity=`investment_upgrade`, prev=`pending`, new=`active`, actor=null
     (service), amount=800000, note "activated after withdrawal/payout …; active
     investment set to 800000".

**Also verify:** `profiles.investment_amount` = 800000 after activation; a
subsequent Return Investment request would now quote 800,000 (upgrade-aware
principal).

---

## Cleanup after testing

Mark the test member suspended (admin Users tab) rather than deleting rows, so
the full audit trail remains intact and referentially consistent.

## Note on admin-side audit coverage

Member-initiated transitions (withdrawal request, return request/submit,
upgrade request) write `financial_audit_log` inside the SECURITY DEFINER RPCs.
Admin-side transitions (withdrawal complete/reject, profit payout, return
approve/reject/complete, upgrade reject/cancel) currently write audit rows from
the API routes using the service role — all except the plain withdrawal
complete/reject path, which predates the audit table. If you want those two
transitions audited identically, ask for the small follow-up patch.
