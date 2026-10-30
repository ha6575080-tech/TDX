import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { seedDatabase, a, b, admin } from "./support/database-fixture.mjs";

// Schema and function fixtures contain catalog definitions only, never live rows.
const repo = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFile(path.join(repo, file), "utf8");

test("financial migration against a local copy of the production schema", async (t) => {
  const db = new PGlite();
  try {
    await seedDatabase(db);
    const asMember = async (sql, params = []) => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
      try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
    };
    await t.test("reproduces legacy approved-deposit bypass before repair", async () => {
      const result = await asMember("insert into deposits(user_id,amount,receipt_image_url,status) values ($1,5000,$2,'approved') returning id", [a, `${a}/legacy.jpg`]);
      assert.equal(result.rows.length, 1);
      await db.exec("delete from deposits;");
    });
    await db.exec(await read("supabase/migrations/20261029102849_restore_required_app_schema.sql"));
    const migration = await read("supabase/migrations/20261029103017_financial_access_after_schema_repair.sql");
    await db.exec(migration);
    const fundingGuard = await read("supabase/migrations/20261029121152_enforce_funded_investment_upgrades.sql");
    await db.exec(fundingGuard);
    await db.exec(fundingGuard);
    await t.test("migration can be reapplied without changing data", async () => { await db.exec(migration); });
    await t.test("legitimate owner pending deposit succeeds", async () => {
      const result = await asMember("insert into deposits(user_id,amount,receipt_image_url,status,payment_method) values ($1,5000,$2,'pending','online_transfer') returning id", [a, `${a}/receipt.jpg`]);
      assert.equal(result.rows.length, 1);
    });
    await t.test("forged approval, cross-member deposit, and receipt traversal are blocked", async () => {
      for (const [owner, receipt, status] of [[a, `${a}/forged.jpg`, "approved"], [b, `${b}/other.jpg`, "pending"], [a, `${b}/other.jpg`, "pending"], [a, `${a}/../other.jpg`, "pending"]]) {
        await assert.rejects(asMember("insert into deposits(user_id,amount,receipt_image_url,status,payment_method) values ($1,5000,$2,$3,'online_transfer')", [owner, receipt, status]));
      }
    });
    await t.test("direct financial, task, and notification content writes are denied", async () => {
      for (const sql of ["update deposits set status='approved'", "delete from deposits", "insert into profits(user_id,month,year,amount,status) values ('"+a+"',1,2026,500,'paid')", "insert into withdrawals(user_id,status) values ('"+a+"','completed')", "insert into notifications(title,message) values ('forged','forged')", "update notifications set message='forged'", "update tasks set deduction_applied=false"]) await assert.rejects(asMember(sql));
    });
    await t.test("system-message impersonation is blocked but user messages work", async () => {
      await assert.rejects(asMember("insert into messages(user_id,sender,message) values ($1,'system','forged')", [a]));
      await asMember("insert into messages(user_id,sender,message) values ($1,'user','fixture')", [a]);
    });
    await t.test("suspended members cannot bypass the API using direct financial RPC calls", async () => {
      await db.query("update profiles set is_suspended=true where id=$1", [a]);
      for (const sql of ["select request_withdrawal() as result", "select request_return_investment() as result", "select request_investment_upgrade(10000) as result"]) {
        const result = await asMember(sql);
        assert.equal(result.rows[0].result.reason, "account_suspended");
      }
      await db.query("update profiles set is_suspended=false where id=$1", [a]);
    });
    await t.test("members cannot call internal admin payment functions", async () => {
      await assert.rejects(asMember("select complete_profit_withdrawal(gen_random_uuid(),8,$1)", [admin]));
      const result = await db.query("select has_function_privilege('anon','public.request_return_investment()','EXECUTE') as allowed");
      assert.equal(result.rows[0].allowed, false);
    });
    await t.test("existing UUID profit row can be completed atomically and only once", async () => {
      await db.query("insert into deposits(user_id,amount,receipt_image_url,status,payment_method) values ($1,5000,$2,'approved','online_transfer')", [a, `${a}/approved.jpg`]);
      await db.query("insert into profits(user_id,month,year,amount,status) values ($1,10,2026,0,'pending')", [a]);
      const wd = await db.query("insert into withdrawals(user_id,status,cycle_number,cycle_start,cycle_end) values ($1,'pending',1,'2026-09-29','2026-10-29') returning id", [a]);
      const args = [wd.rows[0].id, admin];
      const paid = await db.query("select complete_profit_withdrawal($1,8,$2) as result", args);
      assert.equal(paid.rows[0].result.ok, true);
      assert.equal(paid.rows[0].result.profit, 400);
      assert.equal(paid.rows[0].result.net, 300);
      const duplicate = await db.query("select complete_profit_withdrawal($1,8,$2) as result", args);
      assert.equal(duplicate.rows[0].result.reason, "not_pending");
    });
    await db.exec(await read("supabase/migrations/20261029115942_admin_cashflow_reporting.sql"));
    await t.test("unfunded upgrades cannot create profit basis, while funded upgrades remain available", async () => {
      await db.exec("begin;");
      try {
        const unfunded = await asMember("select request_investment_upgrade(10000) as result");
        assert.equal(unfunded.rows[0].result.reason, "unfunded_upgrade");
        await db.query("insert into investment_upgrades(user_id,previous_amount,requested_amount,increase_amount,status) values ($1,5000,10000,5000,'pending')", [a]);
        const blocked = await db.query("select activate_pending_upgrade($1,'payout',gen_random_uuid()) as result", [a]);
        assert.equal(blocked.rows[0].result.reason, "unfunded_upgrade");
        const profile = await db.query("select investment_amount from profiles where id=$1", [a]);
        assert.equal(profile.rows[0].investment_amount, null);
        await db.query("delete from investment_upgrades where user_id=$1", [a]);
        await db.query("update profiles set investment_amount=5000 where id=$1", [a]);
        await db.query("insert into deposits(user_id,amount,status,payment_method,receipt_image_url) values ($1,5000,'approved','online_transfer',$2)", [a, `${a}/funded.png`]);
        const funded = await asMember("select request_investment_upgrade(10000) as result");
        assert.equal(funded.rows[0].result.ok, true);
        const activated = await db.query("select activate_pending_upgrade($1,'payout',gen_random_uuid()) as result", [a]);
        assert.equal(activated.rows[0].result.activated, true);
        const changed = await db.query("select investment_amount from profiles where id=$1", [a]);
        assert.equal(Number(changed.rows[0].investment_amount), 10000);
      } finally { await db.exec("rollback;"); }
    });
    await t.test("cash-flow report counts the withdrawal once, uses net payment and excludes admin users", async () => {
      const result = await db.query("select admin_cashflow_report('2000-01-01','2100-01-01') as report");
      const { summary, reconciliationRequired } = result.rows[0].report;
      assert.equal(summary.totalDeposits, 5000);
      assert.equal(summary.totalPayouts, 0);
      assert.equal(summary.totalWithdrawals, 300);
      assert.equal(summary.feesRetained, 100);
      assert.equal(summary.netCashFlow, 4700);
      assert.equal(summary.totalUsers, 2);
      assert.equal(reconciliationRequired, false);
      await assert.rejects(asMember("select admin_cashflow_report('2000-01-01','2100-01-01')"));
    });
    await t.test("cash-flow totals include more than 1000 records while detail is bounded", async () => {
      await db.query("insert into deposits(user_id,amount,status,payment_method,receipt_image_url) select $1::uuid,5000,'approved','online_transfer',($1::uuid)::text || '/fixture-' || n || '.png' from generate_series(1,1005) as n", [a]);
      const result = await db.query("select admin_cashflow_report('2000-01-01','2100-01-01') as report");
      assert.equal(result.rows[0].report.summary.totalDeposits, 5030000);
      assert.equal(result.rows[0].report.summary.netCashFlow, 5029700);
      assert.equal(result.rows[0].report.breakdown.deposits.length, 200);
      assert.equal(result.rows[0].report.breakdownLimit, 200);
    });
    await db.exec(await read("supabase/migrations/20261029121459_atomic_member_tasks.sql"));
    await t.test("task refreshes create five tasks and deduct each missed day only once", async () => {
      const links = Array.from({ length: 5 }, (_, n) => `https://www.youtube.com/watch?v=abcdefghij${n}`);
      await db.query("insert into tasks(user_id,task_date,youtube_link) select $1,(now() at time zone 'Asia/Karachi')::date-1,link from unnest($2::text[]) link", [a, links]);
      const first = await db.query("select ensure_member_tasks($1,$2) as result", [a, links]);
      const repeated = await db.query("select ensure_member_tasks($1,$2) as result", [a, links]);
      assert.equal(first.rows[0].result.missedDays, 1);
      assert.equal(repeated.rows[0].result.missedDays, 0);
      const profile = await db.query("select total_deductions,daily_tasks_failed from profiles where id=$1", [a]);
      assert.equal(Number(profile.rows[0].total_deductions), 200);
      assert.equal(profile.rows[0].daily_tasks_failed, 1);
      const today = await db.query("select count(*) as n from tasks where user_id=$1 and task_date=(now() at time zone 'Asia/Karachi')::date", [a]);
      assert.equal(Number(today.rows[0].n), 5);
      const taskId = first.rows[0].result.pendingTasks[0].id;
      const missing = await db.query("select complete_member_task($1,$2,$3,$4) as result", [a, taskId, `${a}/missing.png`, links]);
      assert.equal(missing.rows[0].result.reason, "invalid_evidence");
      await db.query("insert into storage.objects(bucket_id,name) values ('task-screenshots',$1)", [`${a}/proof.png`]);
      const done = await db.query("select complete_member_task($1,$2,$3,$4) as result", [a, taskId, `${a}/proof.png`, links]);
      assert.equal(done.rows[0].result.ok, true);
      const replay = await db.query("select complete_member_task($1,$2,$3,$4) as result", [a, taskId, `${a}/other.png`, links]);
      assert.equal(replay.rows[0].result.screenshot_url, `${a}/proof.png`);
      await assert.rejects(asMember("select ensure_member_tasks($1,$2)", [a, links]));
    });
  } finally { await db.close(); }
});
