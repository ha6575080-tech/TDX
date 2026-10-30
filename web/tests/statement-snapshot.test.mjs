import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {seedDatabase,a,b} from "./support/database-fixture.mjs";
const root=path.resolve(import.meta.dirname,"../..");
test("statement snapshot includes complete history, correct payment totals and member isolation",async(t)=>{
 const db=new PGlite();try{
  await seedDatabase(db);
  for(const name of ["20261029102849_restore_required_app_schema","20261029103017_financial_access_after_schema_repair","20261029121152_enforce_funded_investment_upgrades","20261030121313_atomic_admin_financial_decisions","20261030131744_optimize_member_policy_queries","20261030133932_member_statement_snapshot"])await db.exec(await fs.readFile(path.join(root,"supabase/migrations",name+".sql"),"utf8"));
  await db.query("insert into deposits(user_id,amount,status,receipt_image_url) select $1::uuid,5000,'approved',$2::text||n||'.png' from generate_series(1,1100) n",[a,a+'/statement-']);
  const other=(await db.query("insert into deposits(user_id,amount,status,receipt_image_url) values($1::uuid,5000,'approved',$2) returning id",[b,b+'/private.png'])).rows[0].id;
  await db.query("insert into profits(user_id,month,year,amount,status) values($1,10,2026,400,'paid')",[a]);
  await db.query("insert into payouts(user_id,deposit_id,month,year,amount,percentage_applied,status) select $1::uuid,id,10,2026,400,8,'paid' from deposits where user_id=$1::uuid limit 1",[a]);
  await db.query("insert into withdrawals(user_id,amount,fee,net_amount,status,processed_at) values($1,400,100,300,'completed',now())",[a]);
  await db.query("insert into investment_returns(user_id,amount,returned_amount,status,completed_at) values($1,5000,5000,'completed',now())",[a]);
  const snapshot=async(user)=>{await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return(await db.query("select member_statement_snapshot() as result")).rows[0].result;}finally{await db.exec("reset role");}};
  await t.test("more than 1000 records are included without double-counting profit or gross withdrawal",async()=>{
   const data=await snapshot(a);assert.equal(data.deposits.length,1100);assert.equal(data.deposits.some(d=>d.id===other),false);assert.equal(data.payouts.length,1);assert.equal(data.summary.totalDeposited,5500000);assert.equal(data.summary.totalPayouts,400);assert.equal(data.summary.totalWithdrawn,300);assert.equal(data.summary.totalWithdrawalFees,100);assert.equal(data.summary.totalReturnedPrincipal,5000);assert.equal(data.returns.length,1);assert.ok(data.generatedAt);
  });
  await t.test("another session sees only its own financial history",async()=>{const data=await snapshot(b);assert.equal(data.deposits.length,1);assert.equal(data.withdrawals.length,0);assert.equal(data.summary.totalDeposited,5000);});
  await t.test("suspended members cannot bypass the API through the read-only RPC",async()=>{await db.query("update profiles set is_suspended=true where id=$1",[a]);assert.equal(await snapshot(a),null);});
  await t.test("anonymous callers cannot execute the snapshot",async()=>{await db.exec("set role anon");try{await assert.rejects(db.query("select member_statement_snapshot()"));}finally{await db.exec("reset role");}});
 }finally{await db.close();}
});
