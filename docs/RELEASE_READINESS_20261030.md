# TDX readiness — updated 31 October 2026

Target: a free, invitation-only, non-commercial private pilot, selected explicitly by the user. The bounded pilot checks are complete. This is not unrestricted public/commercial launch clearance or a guarantee of zero future errors; see LAUNCH_BLOCKERS_20261031.md for remaining operating limits.

Production: https://tdx-plum.vercel.app
Application commit: a706566bcf5a6a2ac95e37d8d6672b9e80903f0f
Deployment: dpl_7epbawiWoJczGGJSwGvfABEssym3 (READY)
Review: https://github.com/ha6575080-tech/TDX/pull/4

## Delivered and validated

Receipt loading/schema repairs; branded English/Urdu PDF/Word/PNG exports with TDX logo, support 0308-3958294 and electronic issuance stamp; private sharing fallbacks; session-owned complete financial statements; cross-member isolation; fresh suspension checks; server-authoritative financial decisions with locks/audits/replay guards; funded-upgrade and cycle-zero guards; durable five-minute signed reminders; cashflow aggregation and policy/index optimization; private/no-store responses; bounded validation; updated dependencies.

Inactive now saves directly and persists on reload. Active behaves the same; suspension retains confirmation. Authoritative readback and UI validation prevent false success. New tests cover real component clicks through the actual status POST handler and an isolated database RPC.

The latest password release adds Settings password changes with explicit current-password verification, trusted session identity, strong new-password validation, cryptographic reset credentials and safe provider error messages. New tests cover wrong credentials, conflicting identity, transport/provider failures, confirmation mismatch and sensitive-field clearing. Current access tokens may remain valid until expiry after revoking other refresh sessions.

Actions 41194297479 (job 124517240688) passed all 116 regression tests without failures/skips, all 37 member-status checks, lint, type checking and production build. Tests include real PostgreSQL concurrency, rollback/replay, 1100-row statements, multi-page bilingual exports, password UI/API failure handling and default-closed pilot pages. The preceding password release also passed its local build/lint/types and 113 tests; its real-PostgreSQL case passed in hosted CI.

## Live observations

Authenticated admin/Users screens load, and saved inactive states are visible in a fresh Chrome tab. Receipt selection/generation and the live PDF download completed. The downloaded PDF is one A4 page and was visually checked for branding, support number, stamp and unclipped layout. Other export formats also have synthetic bilingual rendering coverage and were downloaded in an earlier authenticated audit. No live status, password or financial transaction was changed for a test, and no member receipt was shared externally.

The final pilot release passed 11 live HTTP checks at 2026-10-31T10:58:07Z: welcome, registration restriction, login, robots, health, dashboard/admin redirects, three protected data endpoints and unauthenticated password mutation rejection. Both pilot pages show the private notice, contain no public signup form and declare noindex. Protected responses are private/no-store, and health is 200/no-store. The runtime-error query reported no errors in the preceding 24 hours. Earlier SMTP connection verification and signed-reminder checks succeeded without test emails or financial actions.

The final Chrome check shows the private-pilot notice and support number. The existing signed-in account's suspended member dashboard is correctly blocked; its administrator Control Room and Settings remain accessible. Settings shows the current/new/confirmation password controls and 12-character guidance, with no browser console errors. This is enforcement of its existing status, not a status change by the audit. No live password was submitted.

Hosted Auth settings were saved and then checked again in the signed-in dashboard: minimum password length 12, secure password change ON, current-password requirement ON, public self-signup OFF and anonymous sign-in OFF. Signup remained OFF after a full dashboard reload. Secure email change remains ON; email confirmation remains unchanged for existing phone-alias accounts. The app's NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false value is explicit on production, preview and development. Opening registration in future requires changing both independent controls and a new app deployment.

## Recovery, operations and free-plan limits

The explicitly approved encrypted local export restored all 21 tables/111 rows with matching fingerprints and foreign keys. It excludes real authentication credentials, provider secrets and uploaded-file contents. Recovery keys are in Supabase Vault and a separate DPAPI-protected local file; no plaintext key or customer-record file was created. See BACKUP_RESTORE_SCOPE.md. This does not establish complete hosted recovery.

The dashboard confirms Supabase Free has no hosted backups and does not provide leaked-password protection. Keep all services free as instructed. The pilot uses testing data/no real payments; free quotas can interrupt availability. Vercel Hobby permits personal, non-commercial use only: https://vercel.com/docs/plans/hobby

Historical migration history remains unreconciled and the Supabase main integration reports MIGRATIONS_FAILED. Do not merge PR4 or replay old migrations until the supported history repair is reviewed and verified. Existing financial rows were not rewritten by the repair migrations; the deposit fingerprint remained e59a7b2deac458550369f39f7b3f3998 through those rollouts.

## Pilot operating boundary

Use the deployed URL only with named testers and no real payments. Existing invited accounts can sign in; account provisioning remains administrator-controlled. Public signup stays closed. The payment features are not a payment-provider sandbox, so do not create fake financial activity against real member records. Exercise financial mutations in the isolated regression database.

Keep the tested production deployment pinned while migration history is repaired. PR4 is reviewable but must not be merged into the failing historical migration integration. No paid plan, hosting migration or subscription was initiated. The ignored local smoke report and configuration screenshots contain audit evidence; the published repository excludes customer downloads, backups and recovery material.
