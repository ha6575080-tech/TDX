# TDX security and regression audit — 29 October 2026

Repository: `ha6575080-tech/TDX`. Production: `tdx-plum.vercel.app`.
Supabase: `jgbbifiizezrwvesdisc`. Vercel project: `tdx`.

## Receipt failure reported during the audit

The receipt picker called `/api/admin/deposits`, whose explicit selection includes
payment-method and review columns absent from the live database. Vercel logs
confirm PostgreSQL `42703` for those requests, including 2026-10-29 10:12 UTC.
The payout picker depended on a separate endpoint with a profile relationship embed.

The picker now uses `/api/admin/receipt/records`, which reads stable deposit/profit
columns and resolves profiles in a separate batch. This removes both dependencies.
Requests have a 15-second timeout, a retry action, and protection against stale
results after changing tabs. Empty payout history displays an empty state.
Receipt-generation requests reject malformed input and unknown types.

## Implemented application changes

- Validate existing member sessions against current suspension status on every
  member API request; fail closed if the profile cannot be verified.
- Reject JSON scalars, null, and arrays across request handlers instead of
  throwing while reading their fields.
- Route deposit submissions through server validation. Derive member identity,
  pending status, and active cash-agent identity on the server. Validate receipt
  ownership and real, non-future payment dates.
- Keep a saved deposit visible as pending if later receipt processing fails,
  avoiding a misleading failure that encourages duplicate submission.
- Validate private receipt paths before service-role downloads or signed links.
- Restrict outbound push destinations to supported browser push providers,
  including subscriptions already stored in the database. Set a send timeout.
- Restrict notification-click navigation to this application's origin.
- Reject cross-origin browser mutations, preserve refreshed cookies on login
  redirects, and cover remaining member routes with session redirects.
- Fix support replies being stored without the session-derived member ID when
  the optional request `user_id` is omitted.
- Fail cron authentication closed when `CRON_SECRET` is missing.
- Add browser security headers and accessible login-field labels/autocomplete.
- Stabilize translation callbacks and the deposit-form Supabase client.
- Add automated regression and build checks for GitHub pull requests and main.

## Dependencies

Initial npm audit: 8 vulnerable packages, including 2 critical and 6 high.
Next.js and its lint configuration were updated to 16.4.3; Nodemailer to 10.3.0.
Compatible transitive security updates were applied to the lockfile.
The final npm audit returned zero known vulnerabilities. This is a package
advisory result, not a guarantee that the application has no vulnerabilities.

## Database findings and production status

All 17 existing public tables have RLS enabled. The database is healthy. However,
permissive legacy policies bypass newer checks: members can directly modify
their deposits, profits, withdrawals, and investment returns. An unrestricted
notification-insert policy permits forged notifications. Direct task writes
allow evidence/penalty tampering, and message inserts permit sender impersonation.

Production deposit range enforcement was restored and verified through
`pg_get_constraintdef`: amount must be between PKR 5,000 and 2,000,000.
No historical transaction was edited by that change.

The broader production schema restorations were rejected by automatic approval
review because they backfill financial dates/rates, alter access controls, and
rewrite package payment-account details. They remain unapplied. In particular,
the payout reminder job still requires its missing database columns/tables.

The new forward migration `20261029095946_harden_financial_access_and_rpc_guards.sql`
removes the legacy bypasses, restricts financial/task/notification writes,
guards direct financial RPCs against suspension, and fixes the bigint/UUID
mismatch in withdrawal completion. It has been tested locally and is pending
production approval. It requires the existing dual-deposit and reminder schema
migrations first; do not replay the entire historical migration directory into
the live database. Live migration history is incomplete and must be reconciled.

Leaked-password protection remains disabled in Supabase Auth. The advisor's
remediation is https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
Some SECURITY DEFINER functions are intentionally callable by authenticated
members because they implement guarded requests. The `is_admin()` helper is
used by RLS. Such advisor warnings require individual review, not blanket revokes.

## Regression evidence

- TypeScript checking passed.
- Production build passed on Next.js 16.4.3, including the new receipt endpoint.
- 29 security/API tests pass, covering malformed input, suspension, ownership,
  push destinations, cross-origin requests, cron authentication, receipt loading,
  and redirect-cookie propagation.
- 9 database scenarios pass in an isolated Postgres engine, using production
  schema/function definitions with synthetic fixture accounts and no live rows.
  These reproduce the approval bypass before repair, verify the migration is
  repeatable, allow legitimate pending deposits, reject forged/cross-member
  writes, preserve user messaging, block suspended RPCs and internal admin RPCs,
  and complete an existing UUID profit row once with the correct profit and fee.
- All 37 existing member-status checks pass.
- Production anonymous account-summary request returned HTTP 401.
- Production login rendered in both Urdu and English in the browser.

The initial repository lint baseline failed with 70 errors. The legacy lint debt
has not been globally suppressed. Full lint is not represented as passing.
Authenticated browser flows and real external email/push deliveries have not
been exercised with real member accounts. Database tests validate local behavior;
they do not establish that the unapplied production migration is already active.

## Remaining engineering risks

- Financial approval/payout paths still contain multi-request transitions that
  should be moved into database transactions, including cross-ledger concurrency.
- Task creation/deductions use separate reads and writes and need an atomic RPC
  to prevent duplicate tasks or inconsistent deductions under concurrent loads.
- Investment-upgrade activation does not verify that the proposed increase has
  been funded by approved deposits; this requires a reviewed financial rule.
- Reminder delivery slots are claimed before sending; failures can leave claims
  without successful delivery. A delivery state machine/retry design is needed.
- Five-minute reminder granularity requires an external scheduler; the configured
  daily Vercel job cannot reliably deliver every short-horizon reminder stage.
- Receipt PDF export uses built-in PDF fonts; Urdu glyph rendering requires a
  suitable embedded font and an export-specific regression check.

These findings prevent an honest declaration that TDX is fully error-free or
that the production security hardening is complete.
