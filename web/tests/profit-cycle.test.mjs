import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {seedDatabase,a,admin} from "./support/database-fixture.mjs";
const root=path.resolve(import.meta.dirname,"../..");
test("future activation cannot create cycle-zero payments",async(t)=>{
 const db=new PGlite();
 try{
  await seedDatabase(db);
  for(const name of ["20261029102849_restore_required_app_schema","20261029103017_financial_access_after_schema_repair","20261029121152_enforce_funded_investment_upgrades","20261030121313_atomic_admin_financial_decisions"])await db.exec(await fs.readFile(path.join(root,"supabase/migrations",name+".sql"),"utf8"));
  await db.query("insert into deposits(user_id,amount,status,receipt_image_url) values($1,5000,'approved',$2)",[a,a+'/cycle.png']);
  await db.query("update profiles set is_active=true,profit_activation_date=now()+interval '1 day' where id=$1",[a]);
  const asMember=async()=>{await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);try{return(await db.query("select request_withdrawal() as result")).rows[0].result;}finally{await db.exec("reset role");}};
  await t.test("reproduces the old pre-activation request bypass",async()=>{const old=await asMember();assert.equal(old.ok,true);assert.equal(old.cycle_number,0);await db.exec("delete from withdrawals;");});
  const repair=await fs.readFile(path.join(root,"supabase/migrations/20261030190844_prevent_preactivation_profit_withdrawal.sql"),"utf8");await db.exec(repair);await db.exec(repair);
  await t.test("first cycle stays scheduled after activation and early requests are denied",async()=>{
   const cycle=(await db.query("select * from withdrawal_current_cycle($1)",[a])).rows[0];assert.equal(cycle.cycle_number,1);assert.ok(new Date(cycle.cycle_start)>new Date());
   const blocked=await asMember();assert.equal(blocked.ok,false);assert.equal(blocked.reason,'not_eligible_30_days');assert.equal(Number((await db.query("select count(*) as n from withdrawals")).rows[0].n),0);
  });
  const isolated=async(run)=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback');}};
  await t.test("invalid cycle zero cannot be completed by the payment API",()=>isolated(async()=>{
   await db.query("update profiles set profit_activation_date=now()-interval '29 days 1 minute' where id=$1",[a]);
   const id=(await db.query("insert into withdrawals(user_id,status,cycle_number,cycle_start,cycle_end) values($1,'pending',0,now()-interval '29 days',now()+interval '1 day') returning id",[a])).rows[0].id;
   const result=(await db.query("select complete_profit_withdrawal($1,8,$2) as result",[id,admin])).rows[0].result;assert.equal(result.reason,'invalid_profit_cycle');
   assert.equal((await db.query("select status from withdrawals where id=$1",[id])).rows[0].status,'pending');
  }));
  for(const hold of ['suspended','return','early'])await t.test(hold+" members cannot have a payment completed",()=>isolated(async()=>{
   await db.query("update profiles set profit_activation_date=now()-interval '29 days 1 minute',is_suspended=$2 where id=$1",[a,hold==='suspended']);
   if(hold==='return')await db.query("insert into investment_returns(user_id,amount,status) values($1,5000,'requested')",[a]);
   const id=(await db.query("insert into withdrawals(user_id,status,cycle_number,cycle_start,cycle_end) values($1,'pending',1,now()-interval '1 day',now()+interval '29 days') returning id",[a])).rows[0].id;
   const result=(await db.query("select complete_profit_withdrawal($1,8,$2) as result",[id,admin])).rows[0].result;
   assert.equal(result.reason,hold==='suspended'?'account_suspended':hold==='return'?'return_investment_hold':'not_eligible_30_days');
  }));
  await t.test("a legitimate final-day request can be paid once",()=>isolated(async()=>{
   await db.query("update profiles set profit_activation_date=now()-interval '29 days 1 minute' where id=$1",[a]);const request=await asMember();assert.equal(request.ok,true);assert.equal(request.cycle_number,1);
   const id=(await db.query("select id from withdrawals where user_id=$1",[a])).rows[0].id;const result=(await db.query("select complete_profit_withdrawal($1,8,$2) as result",[id,admin])).rows[0].result;assert.equal(result.ok,true);assert.equal(result.net,300);
   assert.equal((await db.query("select complete_profit_withdrawal($1,8,$2) as result",[id,admin])).rows[0].result.reason,'not_pending');
  }));
 }finally{await db.close();}
});
