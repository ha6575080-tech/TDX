# TDX free private pilot — 31 October 2026

The user explicitly chose completely free plans and Vercel for a private, non-commercial pilot. No paid upgrade or new hosting account is authorized. Public commercial launch is outside this pilot clearance: Vercel Hobby restricts commercial use, and all free quotas remain applicable.

## Current released code

Private-pilot release a706566bcf5a6a2ac95e37d8d6672b9e80903f0f is READY as Vercel deployment dpl_7epbawiWoJczGGJSwGvfABEssym3. GitHub Actions 41194297479 passed all 116 regression tests without failure/skip plus 37 member-status checks, lint, types and production build. It includes verified Settings password changes, current-password and identity checks, bounded server validation, cryptographic admin-reset credentials, safer errors, clear session-revocation results and default-closed pilot pages. Issued access tokens can remain valid until their provider expiry after other refresh sessions are revoked.

## Pilot access controls saved and verified

The deployed landing/registration pages default to an invitation-only pilot. NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false is explicit for production, preview and development. Public signup requires a new build with that value true, and the separate hosted Supabase signup control must also be enabled. Pilot metadata and robots rules discourage indexing; authentication, not robots, protects private records. Existing accounts remain subject to their normal role/suspension controls. The pilot notice explicitly says testing only and no real payments.

After the compatible code was READY, Supabase public self-signup was disabled and saved; it remained OFF after reloading the dashboard. Anonymous sign-in is OFF. The free password controls were also saved and verified: minimum 12 characters, secure password change ON and current-password requirement ON. Secure email change remains ON. Existing email-confirmation behavior was preserved for phone-alias accounts. The longer reset generator was released before raising the minimum. No actual member password was changed as a test.

## Free-plan limitations confirmed in the signed-in dashboard

TDX is healthy on Supabase Free. The backups page explicitly says project backups are not included. Leaked-password protection is gated to Pro and above; no paid upgrade will be made. The approved encrypted local snapshot passed its 21-table/111-row restore and foreign-key checks, but excludes authentication credentials and actual uploaded file contents. This is not complete hosted recovery and is suitable only within the acknowledged testing scope. Use test data and no real financial operations in the pilot.

The Supabase CLI is still unsigned-in: website login does not supply its management token. Never extract browser credentials or request tokens in chat. The historical production integration reports MIGRATIONS_FAILED; reconcile migration history before merging PR4 or replaying old migrations. Current schema repairs are deployed independently; no historical financial migration was replayed.

## Bounded live browser evidence

The Chrome connection reached the authenticated production admin and Users screens. Saved inactive states were visible in a fresh tab; the agent made no member-status change. Receipt records and generation completed without the old server error. The current receipt PDF downloaded on 31 October (134174 bytes), is one A4 page, and was rendered for visual inspection. Branding, member details, support number, digital stamp and signature note fit without clipping. The customer download remains local and ignored. No receipt was shared externally.

The final deployed welcome/registration pages and 11 bounded live HTTP checks passed, including 401/403 responses for private data and password mutations without authentication, login redirects for private pages, noindex and absence of public signup forms. Health is 200/no-store. The runtime-error query reported no errors in the preceding 24 hours. In Chrome the existing suspended account is correctly blocked from member access while its administrator Control Room loads. No real password, member status or financial transaction was changed for a test; no external sharing occurred.

## Pilot operating boundary and remaining work

The tested invitation-only pilot is available now; no public/commercial launch is claimed. Use named testers and no real payments. Financial features still operate on the connected records, so fake transaction exercises belong in the isolated regression database rather than real member accounts. No paid plan, hosting migration or subscription was initiated.

Keep the tested production deployment pinned. The existing migration-history failure remains the reason not to merge PR4 or enable automatic historical migration replay. Full authentication/file recovery, paid-only leaked-password screening and unrestricted commercial hosting are not established by this free pilot. The local encrypted backup is deliberately limited to its approved scope. These limits remain documented rather than being reported as fixed.

## References

- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/pricing
- https://vercel.com/docs/plans/hobby
