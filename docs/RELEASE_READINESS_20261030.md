# TDX release readiness — updated 31 October 2026

Status: core repairs are deployed and verified. Full launch clearance is pending the provider/browser checks listed below.

Production: https://tdx-plum.vercel.app
Application commit: bc9b29281d43991f1793ffeec21c0e4a003b47cd
Vercel deployment: dpl_8EKATQg2B1dKgMCYx6HFoHqT7g2u (READY)
Review: https://github.com/ha6575080-tech/TDX/pull/4

## Delivered

- Receipt selection no longer depends on missing review fields or ambiguous profile joins. Bank-style English/Urdu PDF, Word and PNG receipts use the TDX logo, support 0308-3958294, and the requested electronic issuance stamp. Payout receipts show gross profit, fee and actual net payment. Sharing supports native file sharing and explicit attachment fallbacks for WhatsApp, Facebook, Instagram, TikTok and email. No private receipt URL is made public.
- Deposits, principal returns, profit completion and daily-task deductions have server-authoritative ownership, suspension/funding guards, transaction locks and replay protection. Rejected requests and returned principal no longer inflate account balances. Two real cycles in one month do not overwrite each other.
- Future activation dates now schedule cycle one rather than opening cycle zero. Profit completion locks the member profile first and rechecks suspension, capital-return holds and stored-cycle timing before payment. No existing dates or financial rows were rewritten. A disposable PostgreSQL test holds a concurrent suspension open and verifies the payment waits, then rejects the suspended member.
- Read-only cash-flow totals avoid duplicate payments and REST row-limit truncation. Nine missing lookup indexes are installed; repeated per-row JWT calls in public policies dropped from 26 to zero without changing ownership rules.
- Five-minute reminders use the canonical monthly cycle, a durable outbox, transactional in-app delivery and leased email retries. Short-lived, method/path/query-bound signatures keep the long-lived credential out of the managed HTTP queue. SMTP cannot guarantee exactly-once after an ambiguous transport failure; stable Message-ID and replay guards limit this risk.
- Statements use one read-only, session-owned SQL snapshot and include complete history, net withdrawals, fees and principal returns. Paginated English/Urdu PDF/Word/PNG exports avoid CSS screenshot and built-in-font failures. Multi-page PNG downloads are ZIP files. Word includes page text descriptions.
- APIs/protected pages send private/no-store cache headers, protected pages fail closed on missing configuration, notification navigation stays on-site, push destinations are allowlisted, and malformed requests produce controlled errors. Dependencies were updated; the latest install audit reported zero known vulnerabilities.

## Validation

GitHub Actions run 41114782794 passed all 96 regression tests with zero failures/skips, plus all 37 existing member-status checks, lint, type checking and production build. Tests include real PostgreSQL concurrency, cross-member data isolation, rollback/replay handling, 1,100 statement records, and multi-page exports in both languages.

Live checks: readiness 200/no-store; private receipt page redirects to login; unauthenticated receipt API returns 403; statements return 401; private responses return private/no-store. The signed reminder worker returned 200 with no due jobs. SMTP connection verification returned 200 without sending an email. The selected deployment returned no error/fatal log groups in the inspected recent window. This is bounded evidence, not a guarantee of zero errors for every future action.

Actual receipt PDF/Word/PNG downloads were verified earlier in an authenticated production session. Current exports were also checked with synthetic samples. Authenticated browser checks of the latest statement release remain pending because browser-control initialization fails.

## Approved backup and isolated restore

The user explicitly approved the defined encrypted export and local restore scope. The encrypted public-data snapshot is saved in .audit-tools/backups/TDX-20261030.public.pgp, excluded from Git. Its random recovery key is protected in Supabase Vault and in a separate Windows-account-protected DPAPI file. No plaintext key or customer-record file was created.

Local restore verified all 21 tables and 111 rows against snapshot fingerprints; all foreign-key checks passed. Authentication identities were placeholders. The snapshot includes nine account IDs and inventory for 14 storage objects, but excludes authentication credentials/session tokens, provider secrets and actual uploaded files. See BACKUP_RESTORE_SCOPE.md and the private restore-report.json for exact evidence. This does not establish complete provider-level authentication or file recovery.

Existing production financial rows were not changed by these repairs; the deposit fingerprint remained e59a7b2deac458550369f39f7b3f3998 across the database rollouts. No real approval, payout or external sharing of member information was used as a test.

## Remaining launch checks

1. Restore authenticated browser testing for login/registration, member/admin flows, mobile interaction and live statement downloads. The control tool still reports a kernel-assets initialization failure after reset.
2. Enable or resolve the provider leaked-password-protection notice and verify the complete hosted-service recovery setup. The Supabase connector does not expose auth-configuration edits; the CLI currently has no access token. A working browser connection or TDX-account CLI sign-in is needed. Provider guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
3. Reconcile production migration history before merging PR 4 or allowing the old folder to replay. The existing Supabase main integration is MIGRATIONS_FAILED. No historical financial migration was replayed.

Security advisors also report intended member/admin SECURITY DEFINER entry points and service-only tables with no member policies. Managed pg_net is non-relocatable and registered in public; its actual HTTP queue lives in net. The long-lived credential remains in Vault; only expiring signatures are queued. Remaining overlapping-policy/unused-index notices are advisory and are not a blanket security clearance.

## 31 October financial guard rollout

The local production-schema fixture reproduced the previous cycle-zero request bypass. The new CLI-created migration 20261030190844_prevent_preactivation_profit_withdrawal.sql was applied twice in the isolated fixture, then installed in production after CI succeeded. Final-day legitimate payments still succeed once; premature, invalid-cycle, suspended and capital-return-held payments are denied. The dashboard cycle calculation and admin error messages match the guard.

Production verification confirms the clamped cycle function and payment guards are installed. There are zero cycle-zero requests; existing deposit fingerprint remains e59a7b2deac458550369f39f7b3f3998. The release is READY on the live alias. The latest 24-hour grouped runtime-error review returned no reported errors; this cannot establish universal error freedom. The current browser/provider/migration-history launch checks above remain unresolved.
