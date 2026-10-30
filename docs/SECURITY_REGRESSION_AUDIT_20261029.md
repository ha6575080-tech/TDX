# TDX security and regression audit — 29 October 2026

Repository: `ha6575080-tech/TDX`. Production: `tdx-plum.vercel.app`.
Supabase: `jgbbifiizezrwvesdisc`. Vercel project: `tdx`.

## Initial status (updated release evidence follows)

The receipt picker and generator were verified in an authenticated production
admin session. The two approved schema/security migrations are now applied.
The production deposit fingerprint stayed unchanged, and catalog checks confirm
member financial/task writes are restricted and direct RPC suspension checks
and the UUID ledger correction are present. The broader application is still
**not cleared for launch** because the financial workflow risks below remain.

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

The original historical schema migrations include financial date/rate backfills
and payment-account changes. They were not applied. Two new forward migrations
restore only required schema and access protections while preserving existing
balances, dates, rates, and payment-account details:

- `20261029102849_restore_required_app_schema.sql`
- `20261029103017_financial_access_after_schema_repair.sql`

The user explicitly approved both migrations; both were successfully applied.
Catalog checks confirmed the new schema, restricted member write/execute grants,
suspension guards, and UUID ledger variable. The remaining ALL policies on the
four money tables are admin-only, guarded by is_admin(). The existing deposit
fingerprint remained 4bc734bb97aab4a88396926a8fab4f9a before and after deployment.
No balance, transaction status, approval date, payout date, rate, or payment-account
setting was backfilled.

Do not replay the historical migration directory: migration history is incomplete.
The connected Supabase main branch reported MIGRATIONS_FAILED. PR #4 must not be
merged until that integration/history is reconciled. Application deployments can
be independently built from the reviewed branch.

Leaked-password protection remains disabled in Supabase Auth. The advisor's
remediation is https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
Some SECURITY DEFINER functions are intentionally callable by authenticated
members because they implement guarded requests. The `is_admin()` helper is
used by RLS. Such advisor warnings require individual review, not blanket revokes.

## Regression evidence

- TypeScript checking passed.
- Production build passed on Next.js 16.4.3, including the new receipt endpoint.
- 37 security/API tests pass, covering malformed input, suspension, ownership,
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

The initial lint baseline had 70 errors. These were repaired without globally
suppressing rules; full lint now passes. CI now includes lint.

Two receipt export scenarios render English/Urdu PNGs, validate a one-page PDF,
and inspect the generated DOCX archive to confirm it contains the identical PNG
and accessible receipt details. The sample files use synthetic member details.
The bank-style layout includes the actual TDX logo, support 0308-3958294, transaction
reference, prominent PKR amount, and an electronic signature stamp with the wording
DIGITALLY SIGNED / No manual signature required. This is an electronic issuance
stamp; no certificate-backed PDF signing service is claimed or configured.

Authenticated receipt loading/generation and the five-option share menu were
verified in the browser. The browser download event stalled during verification;
external sharing of actual member data was not performed. Other member actions
and real external email/push delivery remain unverified.


## Initial engineering risks (see subsequent resolution updates)

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
that all production engineering risks are resolved.

## Receipt sharing and export update

A Share receipt button offers WhatsApp, Facebook, Instagram, TikTok, and Email.
Supported devices share the prepared PNG through the native sharing menu. Other
devices download the image and show explicit app links/instructions for attaching
it. No receipt, member name, phone number, amount, or transaction ID is placed in
a public social URL or uploaded to a third-party sharing service. Direct posting
or recipient selection is left to the device/app. Cancellation is handled.

Additional application changes include a bounded public readiness check, useful
error/not-found pages, private-route crawler exclusions, relationship typing
repairs, and a Content Security Policy that restricts executable/external content.

## Additional repairs

- Member invoices use the shared professional receipt and filter ownership before
  reading private member details. Suspended members cannot open direct invoice links.
- Account summary and health score return an error if required queries fail.
- Dashboard loading/failure states no longer render misleading zero balances.
- Admin loaders use bounded requests and expose failures rather than empty lists.
- Chat language dependencies and native push permission subscription are stable.
- Automated tests cover invalid admin support messages, readiness responses,
  invoice ownership and suspension, plus branded exports.

## Continuation — 30 October 2026

The professional receipt is deployed at commit 4b7be96acca8423809d296ab8782d7fac5120fd1. Actual PDF, DOCX and PNG downloads succeeded from the authenticated production page. A later optimization reduces sample PDFs from about 5.9 MB to 125–140 KB while preserving the rendered receipt.

The admin-only read-only cash-flow report and approved-funding guards are now installed in production. No profile exceeds its recorded approved funding. The cash-flow test avoids counting a withdrawal and its monthly profit ledger entry twice, uses the actual net withdrawal payment, excludes admin accounts from member counts, and totals more than 1,000 records without truncation. The updated reporting and statement application routes are staged for the next release.

The staged task repair serializes creation, missed-day deductions and evidence completion using the same profile lock. Local tests show five daily tasks, one deduction per missed day, real uploaded evidence required, and immutable evidence on replay. The full local suite currently passes 54 tests plus the 37 existing status checks; one real PostgreSQL concurrency test is reserved for CI with a disposable local PostgreSQL service. The task migration is not applied yet, pending that CI result.

Remaining launch blockers include non-atomic admin financial approval/return paths, reminder delivery retries/scheduler accuracy, migration history reconciliation, external delivery checks, and backup/restore evidence. The historical risks above are not a statement that TDX is cleared for unrestricted launch.


## Financial decision release — 30 October 2026

The atomic task migration and reporting routes were deployed at d53bf06cd621613cde703e9654403d82596c7448. CI passed all 55 tests, including real PostgreSQL concurrency, plus 37 existing status checks.

The next reviewed release makes deposit approval and investment-return decisions transactional, records notifications/audit entries in the same transaction, preserves suspension, and prevents a completed principal return from being requested again. Repeated approvals cannot produce duplicate financial events. Failed message insertion rolls back the complete decision. Two legitimate 30-day cycles ending in the same calendar month retain both payments in the profit ledger. Legacy duplicate payout writers are closed; the admin is directed to complete the monthly withdrawal. Account balances exclude rejected requests and unearned profit and subtract completed principal returns.

Payout receipts now identify a completed withdrawal and display the actual net amount paid, gross profit, fee, selected rate, and period. Historical monthly profit records are clearly labelled as summaries. Deposit and payout exports in English and Urdu use identical branded artwork across PNG/PDF/Word, including support 0308-3958294 and the electronic issuance stamp. This stamp is not a certificate-based cryptographic signature. Synthetic samples were visually inspected.

Local lint and type checks pass. The local suite passes 63 of 64 tests plus all 37 status checks; the remaining real PostgreSQL concurrency case runs in CI. Production migration/deployment evidence for this release will be recorded after CI completes. No real member payment or external sharing is used for testing.

Outstanding launch work: reminder retries and scheduling, migration-history reconciliation before merging main, external delivery verification, and backup/restore evidence. The older task, funding, and built-in-PDF-font findings are resolved by the releases above. This audit does not claim an error-free or unrestricted-launch clearance.


## Deployed financial release evidence

Production commit 4c00b6604add50b3c8783a4e1eb34d36bead7c56 is READY on tdx-plum.vercel.app (deployment dpl_2ZkK8VXLCqh3z1XRPLYB5wkLPriu). GitHub Actions run 41056359507 passed all 64 tests without skips and all 37 member-status checks, plus lint, type checks, and production build. The atomic admin financial migration is applied. Before/after ledger fingerprints match: deposits e59a7b2deac458550369f39f7b3f3998, withdrawals/returns d751713988987e9331980363e24189ce. The new financial functions cannot be invoked by member roles; the service role can invoke them.

## Reliable reminder release (verification in progress)

A durable, private outbox replaces the old claims-before-send implementation. It uses the canonical repeating member cycle and confirmed active funding, suppresses suspended/return-held/paid cycles, retries failures, expires worker leases, and identifies each monthly cycle separately. In-app insertion and acknowledgement are transactional per job. Email uses leased retries and stable Message-ID; SMTP cannot guarantee exactly-once delivery after an ambiguous transport failure. Reminders do not assume an unselected 8% rate or write any money. A protected SMTP connection probe sends no message. The scheduler uses Supabase pg_cron/pg_net and a Vault credential, following https://supabase.com/docs/guides/functions/schedule-functions. Access to HTTP request headers is explicitly denied to API roles. No secret is committed.

CI action releases are verified against official v6 refs and pinned. The obsolete unconfigured nested TDX gitlink is removed from the release tree to fix checkout cleanup. Database health checks specify the test database/user. Browser-control and persistent Node tools currently fail to initialize; authenticated live visual checks of the latest release remain pending. Earlier production receipt downloads and current synthetic export checks are recorded above.


## Reminder CI and response privacy

Commit 54c7e2e766d272da15d4a0806cc5b9423ca8acc1 passed all 75 tests without skips, plus 37 existing checks, lint, type check and build (Actions run 41058712405). The production reminder outbox is installed. The scheduler credential was generated securely and transferred to Vault and the sensitive production environment setting without writing it into source files.

Unauthenticated production smoke checks: readiness 200/no-store, login 200, private receipt page 307 to login, receipt API 403; security policy headers are present. The next patch adds explicit private/no-store headers to API and protected-page responses and denies protected pages with 503 if service configuration is missing.


## Live scheduler security finding and remediation

The reminder release is READY at dpl_65B5Fh33Gewi5h2MR81hchHmnHxp. The protected production SMTP probe returned 200 with email_connection=verified; no email was sent. The five-minute job was created successfully. However, live privilege checks show the managed pg_net extension retains PUBLIC queue grants owned by supabase_admin: attempted revocations by the project postgres role are ineffective. The earlier statement that request-header access was denied is superseded by this verified finding.

The scheduled job is temporarily paused while a forward patch switches HTTP authorization to a method/path/query-bound HMAC with a two-minute validity window. The Vault secret remains inaccessible to anonymous/member roles and is never queued by the patched scheduler. Repeated worker invocations are safe through the durable outbox. The Vercel daily fallback remains compatible.


## Latest release and backup approval boundary

Commit 2c30ecff405435a565d7351ddb970850e5cc1c82 is READY in production (dpl_ExHSQm8nUPAkFVDKX8aQstrTeYJL). Actions run 41060203158 passed all 77 tests, including real PostgreSQL concurrency, plus all 37 status checks, lint, types and build. The signed-worker migration is applied and the five-minute scheduler is enabled again. Live receipt page/API responses are private/no-store, readiness is 200/no-store, and unauthorized receipt access is denied.

The requested encrypted application-data snapshot was rejected by automatic approval review because the broad audit authorization did not specifically cover the sensitive production payload and local destination. No production-data snapshot was exported. Recovery-key protection is prepared; the concrete scope is documented in BACKUP_RESTORE_SCOPE.md. Export/restore testing is pending explicit approval. Full launch clearance also remains pending browser regression (the control tool still fails after reset), production migration-history reconciliation, and the provider leaked-password setting.


## Verified signed worker and performance follow-up

The signed worker returned HTTP 200 with zero queued/sent/failed messages. The five-minute scheduler is active; anonymous invocation is denied. Live receipt-page and receipt-API responses now return private, no-store, max-age=0. The browser tool still fails to initialize after a clean reset.

Supabase performance review identified nine missing foreign-key lookup indexes and repeated per-row JWT lookups in member policies. The forward optimization adds covering indexes and evaluates unchanged ownership predicates once per query. Local financial regression passes all 19 tests, including a cross-member privacy check and repeat application of the optimization. The planned production optimization changes no rows or access rules. The backup export remains blocked pending the specific approval requested; no alternative export was attempted.
