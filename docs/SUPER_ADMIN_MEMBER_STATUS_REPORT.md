# Super Admin Member Status Control — Implementation Report

Date: 2026-09-10
Branch: `arena/01a08ae1-tdx`

## Objective (delivered)

The Super Admin can manually set **any** member's account status to
**Active / Inactive / Suspended** at any time — regardless of deposit
activity, receipt/slip upload, pending deposits, or any other financial
state. A member is suspendable immediately after registration with zero
deposits. Member account status is completely independent from deposit
receipt/slip status.

## Status model (reused — no duplicate status system)

The existing `profiles.is_active` / `profiles.is_suspended` boolean fields
are the single source of truth (no new status columns):

| Status     | is_suspended | is_active |
| ---------- | :----------: | :-------: |
| Suspended  | `true`       | preserved (unchanged on suspend) |
| Active     | `false`      | `true`    |
| Inactive   | `false`      | `false`   |

Suspension display precedence is preserved (a suspended member with a
previously-approved deposit shows as Suspended, not Active).

## Files changed

### New
| File | Purpose |
| ---- | ------- |
| `supabase/migrations/20260910000000_member_status_control.sql` | Audit table + atomic `set_member_status()` RPC |
| `web/lib/member-status.ts` | Pure 3-state model (derive / map) shared by API + UI |
| `web/app/api/admin/users/[userId]/status-history/route.ts` | Admin-only audit-trail reader |
| `web/scripts/e2e-member-status.mjs` | E2E suite (10 required scenarios + validation) |
| `web/scripts/test-member-status-logic.mjs` | Unit tests for the pure status model (37 assertions) |

### Modified
| File | Change |
| ---- | ------ |
| `web/app/api/admin/users/route.ts` | New `set_status` action (validated, audited); legacy `toggle_suspend` now routed through the same audited primitive |
| `web/app/api/admin/deposits/route.ts` | **Decoupling fix:** deposit approval no longer writes `is_suspended: false` — a manual suspension is never silently cleared by deposit activity |
| `web/app/api/account/summary/route.ts` | Server-side suspension gate: suspended members get `403 {error:"account_suspended"}` — dashboard data is blocked at the API layer |
| `web/app/api/deposit/route.ts` | Suspension gate: suspended members cannot submit/update deposits (`403`) |
| `web/app/api/withdraw/route.ts` | Suspension gate: suspended members cannot request withdrawals (`403`) |
| `web/app/api/tasks/ensure/route.ts` | Suspension gate: task creation / deduction application (financial side effects) are blocked for suspended members |
| `web/app/login/page.tsx` | Suspended members are blocked at login with a clear "Account Suspended" message (session signed out, no redirect); Super Admins keep control access |
| `web/app/dashboard/page.tsx` | Suspended screen replaces the whole dashboard when the server reports suspension (403 gate or profile flag) |
| `web/app/admin/AdminPanel.tsx` | Users tab: three status controls (Active/Inactive/Suspended) per row, current status highlighted, confirmation modal with optional reason for Suspend/Deactivate, immediate in-place refresh from authoritative server flags, status badge opens the audit-trail history modal |
| `web/lib/i18n.tsx` | New EN + UR strings for the suspended screens, confirmation modal and history view |

## Database / schema changes

`20260910000000_member_status_control.sql` (forward-only, non-destructive):

1. **`public.member_status_changes`** — audit trail:
   `id, member_id → profiles(id), previous_status, new_status,
   changed_by → auth.users(id), reason (nullable), created_at`.
   CHECK constraints on both status columns. RLS **enabled with no
   permissive policies** + all client grants revoked → members (and agents)
   can never read, write, or delete audit rows. Only the service role can
   write, and only inside the SECURITY DEFINER function below.

2. **`public.set_member_status(p_member_id, p_status, p_changed_by,
   p_reason)`** — `SECURITY DEFINER` atomic primitive:
   - validates status ∈ {active, inactive, suspended}
   - **re-checks `p_changed_by` has `role='admin'` at the DB layer**
     (defense in depth; HTTP layer also enforces `requireAdmin()`)
   - row-locks the profile, derives previous status, applies the flag
     update (`suspended` flips only `is_suspended`; `active`/`inactive`
     clear suspension and set `is_active`), inserts the audit row —
     **all in one transaction** (the status can never change without its
     audit row)
   - no-op (no audit row) when target == current status
   - **no financial preconditions whatsoever** — no check on deposits,
     receipts, approvals, amounts, or payment method
   - `EXECUTE` revoked from `public`/`anon`/`authenticated`; only the
     service role (i.e. the Next.js admin API) can invoke it

## API

### `POST /api/admin/users` (existing, extended)
Body: `{ userId, action: "set_status", status: "active"|"inactive"|"suspended", reason? }`

- `requireAdmin()` verifies the **caller's own** `profiles.role = 'admin'`
  (server-side, never client-supplied metadata)
- validates member ID exists (404), status valid (400)
- calls `set_member_status()` (admin re-checked at DB layer, atomic update
  + audit)
- returns `{ success, changed, status, previous_status, is_active,
  is_suspended }` — authoritative flags so the UI refreshes exactly
- legacy `toggle_suspend` still works and is now audited too

### `GET /api/admin/users/:userId/status-history` (new)
Admin-only audit trail for one member (previous → new, actor name, reason,
timestamp). The ONLY route that reads `member_status_changes`; there is no
member-facing route that touches it.

### Member-facing suspension gates (new)
`/api/account/summary`, `/api/deposit`, `/api/withdraw`,
`/api/tasks/ensure` all return `403 {error:"account_suspended"}` for
suspended members. Financial **calculations are untouched** — these are
access-control gates only.

## Exact member-status behavior

- **Suspended**
  - Login blocked: clear "Account Suspended" message (EN/UR), session
    signed out, no redirect.
  - Dashboard blocked server-side (summary 403) + suspended screen shown.
  - Deposits, withdrawals, task deductions blocked (403).
  - Member is NOT deleted; deposits, profits, withdrawals, receipts,
    ledger records and `is_active` are all preserved unchanged.
  - Admin access to all records remains (service-role routes unaffected).
- **Inactive**
  - Account + all history preserved.
  - Per the existing account-status model, the member keeps basic dashboard
    access (the model treats `is_active=false` as "not financially active
    yet" — new members need the dashboard to submit their first deposit);
    they simply remain not financially active until reactivated.
- **Active**
  - Normal member access restored; no historical record is modified.

## Authorization

- HTTP: `requireAdmin()` (caller's own `profiles.role='admin'` via the
  user-scoped client) on every admin route — agents and members get 403.
- DB: `set_member_status()` re-checks the actor's role itself; `EXECUTE`
  is revoked from all client roles, so even a direct RPC with a member JWT
  is refused. Members cannot change their own status through any path.
- UI: buttons exist only in the admin panel; server enforcement does not
  rely on them.

## Deposit independence (audited)

- Removed: `is_suspended: false` write from the deposit-approval profile
  update (`/api/admin/deposits` approve) — the one place account status
  was coupled to deposit activity. Approval now only sets
  `is_active=true` + `profit_activation_date` (unchanged financial
  behavior; a suspended member's approved deposit does NOT unsuspend them).
- Nowhere else in the codebase does account status depend on receipt
  upload/verification, deposit approval, deposit existence, payment method,
  or deposit amount. `is_active` is used only for display, notification
  targeting, and overview counts — never in financial math
  (`lib/account-summary.ts` is untouched).

## Tests performed

1. **Unit** — `node web/scripts/test-member-status-logic.mjs`: **37/37 pass**
   (state derivation, flag payloads, validation, suspend-preserves-state
   invariants, idempotence from every state).
2. **TypeScript** — `npx tsc --noEmit`: clean.
3. **Production build** — `npm run build` (Next 16, Turbopack): compiles
   successfully; new route registered.
4. **Lint** — ESLint on all changed files: identical 30 pre-existing
   errors as baseline (no new errors); 0 new warnings.
5. **E2E** — `node web/scripts/e2e-member-status.mjs` (requires
   `web/.env.local` + Supabase project, same convention as existing
   `e2e-*.mjs` scripts; no live credentials exist in this sandbox, so it is
   committed and ready to run against the project):
   - Part A (DB/RPC): all 10 required scenarios —
     1. fresh member (0 deposits) suspend ✓ 2. no-receipt member suspend ✓
     3. pending-deposit member suspend ✓ 4. approved-deposit member
     suspend ✓ 5. approval does not clear suspension ✓ 6. reactivate
     suspended ✓ 7. mark inactive ✓ 8. reactivate inactive ✓ 9. member JWT
     / anon / non-admin actor all refused (RPC-level + execute revocation)
     ✓ 10. deposits+profits+withdrawals byte-identical through a full
     cycle ✓ — plus invalid status, unknown member, same-status no-op
     (no audit row), and audit-row completeness assertions.
   - Part B (HTTP, auto-skip if app not on `localhost:3000`): suspended
     member gets 403 on summary/deposit/withdraw and cannot reach admin
     endpoints or the audit endpoint; reactivation restores 200; admin
     `set_status` works over HTTP with immediate list refresh.

## Production readiness

- Code: **ready** — type-clean, build-clean, access control enforced
  server-side and at the DB layer, audit is atomic with the state change.
- **Required before go-live:** apply the migration
  (`supabase/migrations/20260910000000_member_status_control.sql`) to the
  Supabase project, then deploy the app. The app works without the
  migration for everything except status changes/audit (the RPC will not
  exist → clear error), so apply migration first.
- After deploy, run `node web/scripts/e2e-member-status.mjs` against the
  live project (with the dev server on port 3000 for Part B) to verify
  end-to-end.
