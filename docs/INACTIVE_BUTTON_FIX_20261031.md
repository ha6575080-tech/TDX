# Admin Inactive control — 31 October 2026

The Inactive action used a second confirmation step, unlike Active. The row action now saves Active and Inactive directly. Suspension retains its confirmation. The selected status has a check mark; saving has a 15-second timeout. Success and error feedback use accessible announcements.

The API verifies the stored profile flags after the audited status update. A mismatched readback returns 409 rather than claiming success. Missing/error readbacks fail visibly, including the legacy deployment-order fallback. The screen also validates the returned flags before changing the badge or announcing success.

The new integration test renders the actual admin component, runs the actual status POST handler, and executes the existing status RPC against a disposable production-schema PGlite fixture. Unrelated navigation/export widgets and initial list responses are isolated. It covers first-click deactivation, persisted reload, reactivation, canceled and confirmed suspension, deactivation from suspension, failed service writes and a competing admin update. Audit insertion and preserved financial fields are checked. It does not claim browser-layout or production authentication coverage.

No production member status was changed as a test. No database migration is required for this fix. Hosted verification and deployment identifiers are recorded in RELEASE_READINESS_20261030.md after rollout.
