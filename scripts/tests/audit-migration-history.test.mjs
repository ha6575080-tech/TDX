import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditMigrationHistory } from '../audit-migration-history.mjs';

const sql = 'create table example (id integer);';
const file = '20260101000000_example.sql';
const metadata = (version = '20260101000000', body = sql) => ({
  version, name: 'example', statement_count: 1,
  statement_md5: createHash('md5').update(body).digest('hex'),
});

test('identical SQL under its recorded version aligns without changing inputs', () => {
  const files = Object.freeze([Object.freeze({ file, sql })]);
  const snapshot = Object.freeze([Object.freeze(metadata())]);
  const result = auditMigrationHistory(files, snapshot);
  assert.equal(result.historyAligned, true);
  assert.equal(result.counts.aligned, 1);
  assert.equal(files[0].sql, sql);
});

test('same SQL under another version proposes a mapping without approving deployment', () => {
  const result = auditMigrationHistory([{ file, sql: sql + '\r\n' }], [metadata('20260201000000')]);
  assert.equal(result.historyAligned, false);
  assert.equal(result.records[0].status, 'version_mismatch');
  assert.equal(result.records[0].proposedFile, '20260201000000_example.sql');
  assert.equal(result.localOnly.length, 0);
});

test('a changed SQL body at the same version cannot silently pass or be renamed', () => {
  const result = auditMigrationHistory([{ file, sql: 'drop table example;' }], [metadata()]);
  assert.equal(result.historyAligned, false);
  assert.equal(result.records[0].status, 'checksum_needs_review');
  assert.equal(result.records[0].proposedFile, undefined);
});

test('separately serialized SQL requires review rather than a false source-change claim', () => {
  const remote = { ...metadata('20260101000000', sql + '\nselect 1;'), statement_count: 2 };
  const result = auditMigrationHistory([{ file, sql: sql + ';\nselect 1;' }], [remote]);
  assert.equal(result.records[0].status, 'checksum_needs_review');
  assert.match(result.note, /do not prove different SQL effects/);
});

test('duplicate matching SQL is ambiguous and cannot produce an automatic mapping', () => {
  const result = auditMigrationHistory([{ file, sql }, { file: '20260102000000_copy.sql', sql }], [metadata('20260201000000')]);
  assert.equal(result.records[0].status, 'ambiguous_checksum');
  assert.equal(result.records[0].proposedFile, undefined);
  assert.equal(result.historyAligned, false);
});

test('pending local migrations and remote-only entries keep the history gate closed', () => {
  const result = auditMigrationHistory([{ file, sql }], [metadata('20260201000000', 'select 42;')]);
  assert.equal(result.counts.localOnly, 1);
  assert.equal(result.counts.remoteOnly, 1);
  assert.equal(result.historyAligned, false);
});

test('duplicate versions and unsafe names are rejected before producing repair advice', () => {
  assert.throws(() => auditMigrationHistory([{ file, sql }, { file: '20260101000000_other.sql', sql }], []), /Duplicate local/);
  assert.throws(() => auditMigrationHistory([], [metadata(), metadata()]), /Duplicate remote/);
  assert.throws(() => auditMigrationHistory([], [{ ...metadata(), name: '../../escape' }]), /Invalid migration metadata/);
  assert.throws(() => auditMigrationHistory([{ file: '../' + file, sql }], []), /Invalid local/);
});
