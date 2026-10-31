# TDX free private pilot — 31 October 2026

The user explicitly chose completely free plans and Vercel for a private, non-commercial pilot. No paid upgrade or new hosting account is authorized. Public commercial launch is outside this pilot clearance: Vercel Hobby restricts commercial use, and all free quotas remain applicable.

## Current released code

Password-security release 39fe3c0974a5c40b57c5a41714f6e8432a0d72e2 is READY as Vercel deployment dpl_93z9c2TT6fBJSb6AuNVfJ7AaW1Hj. GitHub Actions 41193332460 passed all 114 regression tests without failure/skip plus 37 member-status checks, lint, types and production build. It adds verified Settings password changes, current-password and identity checks, bounded server validation, cryptographic admin-reset credentials, safer errors and clear session-revocation results. Issued access tokens can remain valid until their provider expiry after other refresh sessions are revoked.

The GitHub tool connection was temporarily unavailable, then restored by the user. An isolated checkout and commit b9a74bc357b670b5a26b1013bbcd45003ae0ab86 were created under ignored .audit-tools; its Git push did not succeed. The same source was published successfully through the restored GitHub API as 39fe3c0974a5c40b57c5a41714f6e8432a0d72e2. No GitHub token was extracted or exposed.

## Pilot access work in progress

The new landing/registration pages default to an invitation-only pilot. Public signup requires the explicit NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=true build setting, and the separate hosted Supabase signup control must also be enabled. Pilot metadata and robots rules discourage indexing; authentication, not robots, protects private records. Existing accounts remain subject to their normal role/suspension controls. The pilot notice explicitly says testing only and no real payments.

After the compatible pilot code is deployed, disable public self-signup in Supabase and enable the free password protections: minimum 12 characters, secure password change and current-password requirement. These provider changes have not yet been claimed as saved. Do not raise the minimum against the old eight-character reset generator; the longer generator is now released.

## Free-plan limitations confirmed in the signed-in dashboard

TDX is healthy on Supabase Free. The backups page explicitly says project backups are not included. Leaked-password protection is gated to Pro and above; no paid upgrade will be made. The approved encrypted local snapshot passed its 21-table/111-row restore and foreign-key checks, but excludes authentication credentials and actual uploaded file contents. This is not complete hosted recovery and is suitable only within the acknowledged testing scope. Use test data and no real financial operations in the pilot.

The Supabase CLI is still unsigned-in: website login does not supply its management token. Never extract browser credentials or request tokens in chat. The historical production integration reports MIGRATIONS_FAILED; reconcile migration history before merging PR4 or replaying old migrations. Current schema repairs are deployed independently; no historical financial migration was replayed.

## Bounded live browser evidence

The Chrome connection reached the authenticated production admin and Users screens. Saved inactive states were visible in a fresh tab; the agent made no member-status change. Receipt records and generation completed without the old server error. The current receipt PDF downloaded on 31 October as TDX-deposit-077c6615 (1).pdf (134174 bytes), is one A4 page, and was rendered for visual inspection. Branding, member details, support number, digital stamp and signature note fit without clipping. No receipt was shared externally.

Some browser calls timed out and reset the browser runtime. Retest the final private-pilot landing, registration restriction, member/admin routes, current password settings and representative exports after final deployment. No real password or financial transaction was changed as a test.

## References

- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/pricing
- https://vercel.com/docs/plans/hobby
