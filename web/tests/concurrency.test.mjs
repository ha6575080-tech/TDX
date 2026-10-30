import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { seedDatabase, a, admin } from "./support/database-fixture.mjs";

// CI uses a disposable PostgreSQL service containing only synthetic fixtures.
// Never supply a production database URL to this test.
test("simultaneous task, approval, and reminder requests stay idempotent", { skip: !process.env.POSTGRES_TEST_URL }, async () => {
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
    for (const name of ["20261029102849_restore_required_app_schema", "20261029103017_financial_access_after_schema_repair", "20261029121152_enforce_funded_investment_upgrades", "20261029121459_atomic_member_tasks", "20261030121313_atomic_admin_financial_decisions", "20261030123801_reliable_reminder_delivery"]) {
      await one.query(await fs.readFile(path.resolve(import.meta.dirname, `../../supabase/migrations/${name}.sql`), "utf8"));
    }
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
    const deposit = await one.query("insert into deposits(user_id,amount,status,payment_method,receipt_image_url) values ($1,5000,'pending','online_transfer',$2) returning id", [a, `${a}/approval.png`]);
    const depositId = deposit.rows[0].id;
    await one.query("begin");
    const approved = await one.query("select admin_decide_deposit($1,$2,'approve') as result", [depositId, admin]);
    await two.query("begin");
    const duplicate = two.query("select admin_decide_deposit($1,$2,'approve') as result", [depositId, admin]);
    await one.query("commit");
    const ignored = await duplicate;
    await two.query("commit");
    assert.equal(approved.rows[0].result.ok, true);
    assert.equal(ignored.rows[0].result.reason, "already_processed");
    const audit = await one.query("select count(*) as n from financial_audit_log where entity='deposit' and entity_id=$1", [depositId]);
    assert.equal(Number(audit.rows[0].n), 1);
    await one.query("update profiles set profit_activation_date=now()-interval '29 days 1 minute' where id=$1",[a]);
    await one.query("begin");
    const queued=await one.query("select queue_payout_reminders() as result");
    await two.query("begin");
    const duplicateReminder=two.query("select queue_payout_reminders() as result");
    await one.query("commit");
    const repeatedReminder=await duplicateReminder;
    await two.query("commit");
    assert.equal(queued.rows[0].result.in_app_sent,1);
    assert.equal(repeatedReminder.rows[0].result.in_app_sent,0);
  } finally {
    await one.query("rollback").catch(() => {});
    await two.query("rollback").catch(() => {});
    await Promise.all([one.end(), two.end()]);
  }
});
