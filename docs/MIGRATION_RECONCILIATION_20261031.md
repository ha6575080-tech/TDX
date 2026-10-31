# TDX migration-history reconciliation — 31 October 2026

Status: read-only inventory complete; production history has not been changed. The deployed private pilot remains pinned. Do not merge PR4 or replay the historical migration directory during this work.

## Observed mismatch

The live database records 14 migrations. The repository has 26 SQL files:

- Thirteen live repairs match repository SQL checksums, after LF normalization or removal of surrounding whitespace, but have different version timestamps. One of these is the restored deposit amount constraint recorded under a different descriptive name.
- The existing profit_cycle_model version matches, but its recorded checksum comes from 21 separately stored statements. It needs SQL review; a different serialized checksum alone does not prove different SQL effects.
- Twelve older local files have no matching history entry. Their effects may be present or superseded; they must not simply be marked applied without schema verification.

The Supabase main integration still reports MIGRATIONS_FAILED, while its database is ACTIVE_HEALTHY. Existing SQL includes deposit date/rate backfills and payment-account replacements. Replaying it can change business records even when some DDL is idempotent.

The read-only comparator is scripts/audit-migration-history.mjs. It never connects to a database, executes SQL, renames a file or edits history. It refuses ambiguous checksum mappings and duplicate/unsafe versions or names. Its comparison does not establish schema compatibility.

Export only this metadata for its input (no customer records, credentials or stored SQL bodies):

```sql
select version, name, cardinality(statements) as statement_count,
       md5(array_to_string(statements, E'\n')) as statement_md5
from supabase_migrations.schema_migrations
order by version;
```

Save the rows as an array or as a migrations array in a JSON object, then run:

```powershell
node scripts/audit-migration-history.mjs --snapshot <metadata.json>
```

Exit 0 means the saved metadata and local file versions/checksums align; exit 2 means unresolved history; exit 1 means invalid input. Refresh the metadata before making any repair. The ignored current snapshot/report contain schema-history metadata only. Seven regression cases cover changed SQL, shifted versions, serialized statements, ambiguous matches, pending files and unsafe input.

## Phased repair and rollback gates

1. Keep the tested app deployment and the historical integration hold. Obtain a short-lived TDX-only management credential for the supported CLI workflow. CLI 2.122.0 is already available locally; the browser/MCP connection does not supply its credential. A project-scoped token must be supplied through SUPABASE_ACCESS_TOKEN; the current CLI login command rejects project-scoped tokens. No token should be pasted into chat or committed.
2. Capture schema-only exports and the complete original migration-history metadata using the authenticated official tools. Keep history SQL private until reviewed for secrets. Do not broaden the approved customer-data backup into authentication credentials or uploaded-file contents. Record public-schema definitions, functions, grants, policies, custom Auth/Storage objects and scheduler dependencies. Rollback before a live change is discarding this isolated preparation.
3. Review the twelve untracked historical migrations against the actual schema. Resolve the serialized profit-cycle source separately. Prepare a current-state baseline or explicit verified version mappings; archive superseded historical scripts without destroying them. Generate any new migration using the official CLI. Do not classify an old data backfill as applied merely because the current schema looks similar. Rollback is restoring the original source paths and references.
4. Rebuild a disposable Supabase-compatible database from the proposed migration source. Compare schema/security metadata, validate custom Auth/Storage behavior and run the financial concurrency, member-isolation, receipt and password regressions. Under the migration-architect gate, the compatibility checker must pass or the owner must explicitly accept every incompatibility; a rollback runbook must exist. No live history writes are cleared until these checks pass. Rollback is discarding the disposable database and retaining the pinned release.
5. Use the supported migration-history repair workflow only after the current database state and baseline are verified. History repair must change tracking records only, without running historical SQL on production. Preserve the complete original history for rollback. Recheck financial fingerprints and schema/security definitions; never undo an independent member/admin action to make a fingerprint match. If a check fails, restore the exact original history using the preserved metadata and retain the pinned application; do not roll customer records back.
6. Refresh the live metadata, rerun the comparator and confirm no unintended migration is pending in the official dry run. Only then remove the merge hold, merge the reviewed baseline and check the integration status, private-pilot access and deployed artifact. If integration fails, retain the known-good app and restore the pre-cutover tracking/source pair. No destructive reset, paid preview branch or automatic old-migration replay is part of this plan.

## Configuration drift corrected in source

The local Supabase config still had public signup enabled, a six-character password minimum, insecure password-change defaults and six-digit email OTPs. The source now uses closed signup, minimum 12, secure password changes, eight-digit OTPs and a one-minute email-request interval. Local redirect URLs remain local; this is not a blind push of development config to production. The hosted current-password requirement remains separately enabled and must be checked after any future configuration deployment.

This source correction does not change a member password, status, balance or payment account. The hosted controls were already saved and verified in the preceding private-pilot release. No remote config push or history repair has been performed by this read-only inventory.

## Scope and references

Manual Easypaisa/JazzCash transfers remain outside the app: administrators verify transfers before TDX records an approval. This does not make the deployment a payment sandbox or establish commercial hosting eligibility. The user selected free services and personal non-commercial private testing with no real payments.

- https://supabase.com/docs/reference/cli/supabase-migration-repair
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/deployment/branching/configuration
- https://supabase.com/changelog/scoped-personal-access-tokens-ga
