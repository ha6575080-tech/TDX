import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { seedDatabase, a } from "./support/database-fixture.mjs";
const root=path.resolve(import.meta.dirname,"../..");
test("durable reminders survive failures, isolate cycles, and preserve money", async(t)=>{
 const db=new PGlite();
 try{
  await seedDatabase(db);
  for(const name of ["20261029102849_restore_required_app_schema","20261029103017_financial_access_after_schema_repair","20261029121152_enforce_funded_investment_upgrades","20261030121313_atomic_admin_financial_decisions","20261030123801_reliable_reminder_delivery"]) await db.exec(await fs.readFile(path.join(root,"supabase/migrations",name+".sql"),"utf8"));
  await db.query("insert into deposits(user_id,amount,status,receipt_image_url) values($1,5000,'approved',$2)",[a,`${a}/reminder.png`]);
  await db.query("update profiles set is_active=true,profit_activation_date=now()-interval '29 days 1 minute' where id=$1",[a]);
  const moneyBefore=(await db.query("select to_jsonb(d) as row from deposits d")).rows;
  await t.test("only one current-stage notification is sent on repeated runs",async()=>{
   const first=(await db.query("select queue_payout_reminders() as result")).rows[0].result;
   assert.equal(first.queued,2);assert.equal(first.in_app_sent,1);
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.in_app_sent,0);
   assert.equal(Number((await db.query("select count(*) as n from notifications where user_id=$1",[a])).rows[0].n),1);
  });
  await t.test("email failures can retry and stale worker tokens cannot acknowledge a new lease",async()=>{
   const job=(await db.query("select * from claim_payout_reminder_emails(5)")).rows[0];
   assert.ok(job);assert.equal((await db.query("select * from claim_payout_reminder_emails(5)")).rows.length,0);
   assert.equal((await db.query("select finish_payout_reminder_email($1,$2,false) as ok",[job.id,job.claim_token])).rows[0].ok,true);
   await db.query("update payout_reminder_jobs set next_attempt_at=now()-interval '1 minute' where id=$1",[job.id]);
   const retry=(await db.query("select * from claim_payout_reminder_emails(5)")).rows[0];
   assert.notEqual(retry.claim_token,job.claim_token);
   assert.equal((await db.query("select finish_payout_reminder_email($1,$2,true) as ok",[job.id,job.claim_token])).rows[0].ok,false);
   assert.equal((await db.query("select finish_payout_reminder_email($1,$2,true) as ok",[retry.id,retry.claim_token])).rows[0].ok,true);
   assert.equal((await db.query("select * from claim_payout_reminder_emails(5)")).rows.length,0);
  });
  await t.test("the next cycle can send the same stage and no financial row is changed",async()=>{
   await db.query("update profiles set profit_activation_date=profit_activation_date-interval '30 days' where id=$1",[a]);
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.in_app_sent,1);
   assert.deepEqual((await db.query("select to_jsonb(d) as row from deposits d")).rows,moneyBefore);
   assert.equal(Number((await db.query("select count(distinct cycle_number) as n from payout_reminder_jobs")).rows[0].n),2);
  });
  await t.test("suspension blocks both new reminders and outstanding email claims",async()=>{
   await db.query("update profiles set is_suspended=true where id=$1",[a]);
   assert.equal((await db.query("select * from claim_payout_reminder_emails(5)")).rows.length,0);
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.queued,0);
  });
  await t.test("members cannot inspect or invoke the privileged delivery worker",async()=>{
   await db.exec("set role authenticated");
   for(const sql of ["select * from payout_reminder_jobs","select queue_payout_reminders()","select * from claim_payout_reminder_emails(5)"]) await assert.rejects(db.exec(sql));
   await db.exec("reset role");
  });
  await t.test("failed in-app insertion preserves email jobs and retries without duplicate notices",async()=>{
   await db.query("update profiles set is_suspended=false,profit_activation_date=profit_activation_date-interval '30 days' where id=$1",[a]);
   await db.exec("create function fixture_fail_notice() returns trigger language plpgsql as $$ begin raise exception 'Synthetic notification failure'; end; $$; create trigger fixture_fail_notice before insert on notifications for each row execute function fixture_fail_notice();");
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.in_app_failed,1);
   assert.equal(Number((await db.query("select count(*) as n from payout_reminder_jobs where cycle_number=3 and channel='email' and status='pending'")).rows[0].n),1);
   await db.exec("drop trigger fixture_fail_notice on notifications; drop function fixture_fail_notice();");
   await db.exec("update payout_reminder_jobs set next_attempt_at=now()-interval '1 minute' where status='failed'");
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.in_app_sent,1);
   assert.equal((await db.query("select queue_payout_reminders() as result")).rows[0].result.in_app_sent,0);
  });
  await t.test("a crashed email worker lease expires and can be reclaimed",async()=>{
   const old=(await db.query("select * from claim_payout_reminder_emails(5)")).rows[0];
   await db.query("update payout_reminder_jobs set claimed_at=now()-interval '3 minutes' where id=$1",[old.id]);
   const retry=(await db.query("select * from claim_payout_reminder_emails(5)")).rows[0];
   assert.equal(old.id,retry.id);assert.notEqual(old.claim_token,retry.claim_token);
   assert.equal((await db.query("select finish_payout_reminder_email($1,$2,true) as ok",[old.id,old.claim_token])).rows[0].ok,false);
  });
 }finally{await db.close();}
});
