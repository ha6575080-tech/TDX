import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationFile = /^(\d{14})_([A-Za-z0-9_]+)\.sql$/;
const md5 = (value) => createHash('md5').update(value).digest('hex');

// This tool only reads SQL source and migration metadata. It never executes SQL,
// edits a file, connects to a database, or marks a migration as applied.
export function auditMigrationHistory(files, snapshot) {
  const remote = Array.isArray(snapshot) ? snapshot : snapshot?.migrations;
  if (!Array.isArray(remote)) throw new Error('Expected a migration metadata array.');
  const localVersions = new Set();
  const locals = files.map(({ file, sql }) => {
    const parsed = migrationFile.exec(file);
    if (!parsed || typeof sql !== 'string') throw new Error('Invalid local migration file.');
    if (localVersions.has(parsed[1])) throw new Error('Duplicate local migration version.');
    localVersions.add(parsed[1]);
    const normalized = sql.replace(/\r\n/g, '\n');
    return {
      file, version: parsed[1], name: parsed[2],
      checksums: new Set([md5(normalized), md5(normalized.trim())]),
    };
  });
  const remoteVersions = new Set();
  const claimed = new Set();
  const records = remote.map((entry) => {
    if (!/^\d{14}$/.test(entry?.version ?? '') ||
        !/^[A-Za-z0-9_]+$/.test(entry?.name ?? '') ||
        !/^[a-f0-9]{32}$/.test(entry?.statement_md5 ?? '') ||
        !Number.isInteger(entry?.statement_count) || entry.statement_count < 0) {
      throw new Error('Invalid migration metadata; export version, name, statement_count and statement_md5.');
    }
    if (remoteVersions.has(entry.version)) throw new Error('Duplicate remote migration version.');
    remoteVersions.add(entry.version);
    const sameVersion = locals.find((local) => local.version === entry.version);
    const checksumMatches = locals.filter((local) => local.checksums.has(entry.statement_md5));
    const result = { version: entry.version, name: entry.name, statementCount: entry.statement_count };
    if (sameVersion) {
      claimed.add(sameVersion.file);
      return {
        ...result, file: sameVersion.file,
        status: sameVersion.checksums.has(entry.statement_md5) ? 'aligned' : 'checksum_needs_review',
      };
    }
    if (checksumMatches.length === 1) {
      const local = checksumMatches[0];
      claimed.add(local.file);
      return {
        ...result, file: local.file, status: 'version_mismatch',
        proposedFile: `${entry.version}_${entry.name}.sql`,
      };
    }
    return { ...result, status: checksumMatches.length > 1 ? 'ambiguous_checksum' : 'remote_only' };
  });
  const localOnly = locals.filter((local) => !claimed.has(local.file)).map((local) => local.file);
  const count = (status) => records.filter((record) => record.status === status).length;
  return {
    snapshotAt: snapshot?.capturedAt ?? null,
    historyAligned: records.every((record) => record.status === 'aligned') && localOnly.length === 0,
    counts: {
      local: locals.length, remote: remote.length, aligned: count('aligned'),
      versionMismatch: count('version_mismatch'), checksumNeedsReview: count('checksum_needs_review'),
      remoteOnly: count('remote_only'), ambiguousChecksum: count('ambiguous_checksum'), localOnly: localOnly.length,
    },
    records, localOnly,
    note: 'Read-only snapshot comparison. Different serialized-statement checksums require SQL review; they do not prove different SQL effects. Refresh metadata before any repair. Alignment alone does not certify schema compatibility or launch readiness.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/audit-migration-history.mjs --snapshot <metadata.json> [--migrations <directory>]');
    console.log('Exit codes: 0 aligned, 2 unresolved history, 1 invalid input. Read-only; no credentials required.');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--snapshot', '--migrations'].includes(args[index]) || !args[index + 1] || options[args[index]]) {
      throw new Error('Expected one --snapshot path and optional --migrations directory.');
    }
    options[args[index]] = args[index + 1];
  }
  if (!options['--snapshot']) throw new Error('A metadata snapshot is required. Use --help.');
  const directory = options['--migrations'] ?? fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const [snapshot, entries] = await Promise.all([
    readFile(options['--snapshot'], 'utf8').then((value) => JSON.parse(value.replace(/^\uFEFF/, ''))),
    readdir(directory, { withFileTypes: true }),
  ]);
  const files = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => ({ file: entry.name, sql: await readFile(resolve(directory, entry.name), 'utf8') })));
  const report = auditMigrationHistory(files, snapshot);
  console.log(JSON.stringify(report, null, 2));
  if (!report.historyAligned) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
