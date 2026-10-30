import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { seedDatabase, a } from "./support/database-fixture.mjs";

// CI uses a disposable PostgreSQL service containing only synthetic fixtures.
// Never supply a production database URL to this test.
test("simultaneous task requests create five tasks and charge a missed day once", { skip: !process.env.POSTGRES_TEST_URL }, async () => {
  const connectionString = process.env.POSTGRES_TEST_URL;
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1", "postgres"].includes(url.hostname), "concurrency tests require a local disposable database");
  assert.equal(url.pathname, "/tdx_test");
  const one = new pg.Client({ connectionString, query_timeout: 10000, connectionTimeoutMillis: 5000 });
  const two = new pg.Client({ connectionString, query_timeout: 10000, connectionTimeoutMillis: 5000 });
  await one.connect();
  await two.connect();
  const links = Array.from({ length: 5 }, (_, n) => `https://www.youtube.com/watch?v=abcdefghij${n}`);
  try {
    await seedDatabase({ exec: (sql) => one.query(sql), query: (sql, args) => one.query(sql, args) });
    const migration = await fs.readFile(path.resolve(import.meta.dirname, "../../supabase/migrations/20261029121459_atomic_member_tasks.sql"), "utf8");
    await one.query(migration);
    await one.query("insert into tasks(user_id,task_date,youtube_link) select $1,(now() at time zone 'Asia/Karachi')::date-1,link from unnest($2::text[]) link", [a, links]);
    await one.query("begin");
    const first = await one.query("select ensure_member_tasks($1,$2) as result", [a, links]);
    await two.query("begin");
    let secondFinished = false;
    const second = two.query("select ensure_member_tasks($1,$2) as result", [a, links]).then((result) => { secondFinished = true; return result; });
    // The first transaction owns the profile lock until it commits.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(secondFinished, false);
    await one.query("commit");
    const repeated = await second;
    await two.query("commit");
    assert.equal(first.rows[0].result.missedDays, 1);
    assert.equal(repeated.rows[0].result.missedDays, 0);
    const totals = await one.query("select daily_tasks_failed,total_deductions,(select count(*) from tasks where user_id=$1 and task_date=(now() at time zone 'Asia/Karachi')::date) as today_count from profiles where id=$1", [a]);
    assert.equal(Number(totals.rows[0].total_deductions), 200);
    assert.equal(Number(totals.rows[0].daily_tasks_failed), 1);
    assert.equal(Number(totals.rows[0].today_count), 5);
  } finally {
    await one.query("rollback").catch(() => {});
    await two.query("rollback").catch(() => {});
    await Promise.all([one.end(), two.end()]);
  }
});
