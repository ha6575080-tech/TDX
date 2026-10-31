# TDX readiness — updated 31 October 2026

Target: a free, invitation-only, non-commercial private pilot, selected explicitly by the user. Do not describe this as unrestricted public/commercial launch clearance or guarantee zero future errors. Final pilot gating/provider checks are in progress; see LAUNCH_BLOCKERS_20261031.md.

Production: https://tdx-plum.vercel.app
Application commit: 39fe3c0974a5c40b57c5a41714f6e8432a0d72e2
Deployment: dpl_93z9c2TT6fBJSb6AuNVfJ7AaW1Hj (READY)
Review: https://github.com/ha6575080-tech/TDX/pull/4

## Delivered and validated

Receipt loading/schema repairs; branded English/Urdu PDF/Word/PNG exports with TDX logo, support 0308-3958294 and electronic issuance stamp; private sharing fallbacks; session-owned complete financial statements; cross-member isolation; fresh suspension checks; server-authoritative financial decisions with locks/audits/replay guards; funded-upgrade and cycle-zero guards; durable five-minute signed reminders; cashflow aggregation and policy/index optimization; private/no-store responses; bounded validation; updated dependencies.

Inactive now saves directly and persists on reload. Active behaves the same; suspension retains confirmation. Authoritative readback and UI validation prevent false success. New tests cover real component clicks through the actual status POST handler and an isolated database RPC.

The latest password release adds Settings password changes with explicit current-password verification, trusted session identity, strong new-password validation, cryptographic reset credentials and safe provider error messages. New tests cover wrong credentials, conflicting identity, transport/provider failures, confirmation mismatch and sensitive-field clearing. Current access tokens may remain valid until expiry after revoking other refresh sessions.

Actions 41193332460 passed all 114 regression tests without failures/skips, all 37 member-status checks, lint, type checking and production build. Tests include real PostgreSQL concurrency, rollback/replay, 1100-row statements and multi-page bilingual exports. Local validation of the same release also passed build/lint/types and 113 tests; the real-PostgreSQL case was deferred to the successful hosted run.

## Live observations

Authenticated admin/Users screens load, and saved inactive states are visible in a fresh Chrome tab. Receipt selection/generation and the live PDF download completed. The downloaded PDF is one A4 page and was visually checked for branding, support number, stamp and unclipped layout. Other export formats also have synthetic bilingual rendering coverage and were downloaded in an earlier authenticated audit. No live status, password or financial transaction was changed for a test, and no member receipt was shared externally.

Earlier deployed checks verified health 200/no-store; private APIs return 401/403 and protected pages redirect to login; SMTP connection verification and signed reminders work without test emails or financial actions. Repeat bounded health/access checks after the final pilot release.

## Recovery, operations and free-plan limits

The explicitly approved encrypted local export restored all 21 tables/111 rows with matching fingerprints and foreign keys. It excludes real authentication credentials, provider secrets and uploaded-file contents. Recovery keys are in Supabase Vault and a separate DPAPI-protected local file; no plaintext key or customer-record file was created. See BACKUP_RESTORE_SCOPE.md. This does not establish complete hosted recovery.

The dashboard confirms Supabase Free has no hosted backups and does not provide leaked-password protection. Keep all services free as instructed. The pilot uses testing data/no real payments; free quotas can interrupt availability. Vercel Hobby permits personal, non-commercial use only: https://vercel.com/docs/plans/hobby

Historical migration history remains unreconciled and the Supabase main integration reports MIGRATIONS_FAILED. Do not merge PR4 or replay old migrations until the supported history repair is reviewed and verified. Existing financial rows were not rewritten by the repair migrations; the deposit fingerprint remained e59a7b2deac458550369f39f7b3f3998 through those rollouts.

## Next verification

Deploy the invitation-only pilot pages, disable public self-signup in Supabase, save/verify its available password protections, and retest the final deployed access and UI. Public registration should require both an explicit app build setting and the separate hosted Auth setting before it can be reopened. No paid plan, hosting migration or subscription should be initiated.
