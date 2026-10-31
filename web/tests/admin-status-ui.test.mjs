import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
import {seedDatabase,a,admin} from './support/database-fixture.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://tdx.test/admin'});
for(const name of ['window','document','HTMLElement','Element','Node','MutationObserver'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,within,waitFor,cleanup}=await import('@testing-library/react');
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');
function load(file,mocks={}){
 const filename=path.join(root,file),exports={};
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const resolve=name=>name in mocks?mocks[name]:name.startsWith('@/')?load(name.slice(2)+(fs.existsSync(path.join(root,name.slice(2)+'.tsx'))?'.tsx':'.ts'),mocks):require(name);
 vm.runInNewContext(output,{exports,require:resolve,window:dom.window,document:dom.window.document,navigator:dom.window.navigator,fetch:(...args)=>globalThis.fetch(...args),Response,Request,URL,console,process,setTimeout,clearTimeout,AbortSignal,Intl,TextEncoder},{filename});return exports;
}
const blank=()=>null;
const Panel=load('app/admin/AdminPanel.tsx',{
 'next/link':({children,...props})=>React.createElement('a',props,children),
 '@/components/ui':{GlassPanel:({children})=>React.createElement('div',null,children),FeedItem:blank,Gauge:blank},
 '@/components/UserDropdown':blank,
 '@/components/ReceiptGenerator':blank,
}).default;
const originalFetch=globalThis.fetch;
test('admin status buttons save the real audited transition without an extra inactive confirmation',async(t)=>{
 const db=new PGlite();
 try{
  await seedDatabase(db);
  await db.exec(fs.readFileSync(path.join(root,'../supabase/migrations/20261029102849_restore_required_app_schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'../supabase/migrations/20261029103017_financial_access_after_schema_repair.sql'),'utf8'));
  const financialFingerprint=async()=>JSON.stringify((await db.query('select investment_amount,profit_activation_date,referral_bonus,total_deductions from profiles where id=$1',[a])).rows);
  async function scenario(run,{rpcFails=false,race=false}={}){
   await db.exec('begin');
   let writes=0;const statuses=[];
   try{
    await db.query("update profiles set is_active=true,is_suspended=false where id=$1",[a]);
    const client={rpc:async(name,args)=>{
     if(rpcFails)return {data:null,error:{message:'Fixture service unavailable'}};
     const result=(await db.query('select set_member_status($1,$2,$3,$4) as result',[args.p_member_id,args.p_status,args.p_changed_by,args.p_reason])).rows[0].result;
     if(race)await db.query("select set_member_status($1,'active',$2,'Concurrent admin')",[a,admin]);
     return {data:result,error:null};
    },from:()=>({select:()=>({eq:(_column,id)=>({single:async()=>({data:(await db.query('select is_active,is_suspended from profiles where id=$1',[id])).rows[0],error:null})})})})};
    const route=load('app/api/admin/users/route.ts',{
     'next/server':{NextResponse:{json:Response.json}},
     '@/lib/admin-auth':{requireAdmin:async()=>({user:{id:admin},error:null})},
     '@/lib/supabase/server':{createServiceRoleClient:async()=>client},
     '@/lib/api-errors':{internalError:()=>Response.json({error:'Unable to save member status'},{status:500}),logServerWarn(){}},
    });
    globalThis.fetch=async(url,options)=>{
     if(options?.method==='POST'){writes++;const response=await route.POST(new Request('https://tdx.test'+url,{...options}));statuses.push(response.status);return response;}
     if(url==='/api/admin/users'){
      const profile=(await db.query('select * from profiles where id=$1',[a])).rows[0];
      return Response.json({users:[{...profile,full_name:'Status fixture',username:'status-fixture',total_deposited:0,total_withdrawn:0}]});
     }
     return Response.json({totalUsers:1,activeUsers:1,suspendedUsers:0,totalApprovedDeposits:0,totalWithdrawals:0,pendingDeposits:0,pendingWithdrawals:0});
    };
    const mount=async()=>{const view=render(React.createElement(Panel));fireEvent.click(await view.findByRole('button',{name:'Users',exact:true}));const row=await view.findByRole('row',{name:/Status fixture/});return {view,row:within(row)};};
    await run({mount,db,getWrites:()=>writes,statuses,financialFingerprint});
   }finally{cleanup();globalThis.fetch=originalFetch;await db.exec('rollback');}
  }
  await t.test('Inactive saves on the first click, survives reload, and Active restores it',()=>scenario(async({mount,db,getWrites,financialFingerprint})=>{
   const before=await financialFingerprint();let {view,row}=await mount();fireEvent.click(row.getByRole('button',{name:'Inactive',exact:true}));
   await waitFor(()=>assert.equal(row.getByRole('button',{name:'Inactive',pressed:true}).disabled,true));
   assert.equal(getWrites(),1);assert.equal(view.queryByRole('button',{name:'Confirm',exact:true}),null);
   assert.equal((await db.query('select is_active from profiles where id=$1',[a])).rows[0].is_active,false);
   assert.equal(Number((await db.query('select count(*) as n from member_status_changes where member_id=$1',[a])).rows[0].n),1);
   assert.equal(await financialFingerprint(),before);view.unmount();({view,row}=await mount());
   assert.equal(row.getByRole('button',{name:'Inactive',pressed:true}).disabled,true);
   fireEvent.click(row.getByRole('button',{name:'Active',exact:true}));await waitFor(()=>assert.equal(row.getByRole('button',{name:'Active',pressed:true}).disabled,true));
   assert.equal(await financialFingerprint(),before);
  }));
  await t.test('Suspended still asks for confirmation and Cancel sends no write',()=>scenario(async({mount,getWrites})=>{
   const {view,row}=await mount();fireEvent.click(row.getByRole('button',{name:'Suspended',exact:true}));assert.ok(view.getByRole('button',{name:'Confirm',exact:true}));assert.equal(getWrites(),0);
   fireEvent.click(view.getByRole('button',{name:'Cancel',exact:true}));assert.equal(view.queryByRole('button',{name:'Confirm',exact:true}),null);assert.equal(getWrites(),0);
  }));
  await t.test('Confirmed suspension saves while preserving the activation flag',()=>scenario(async({mount,db,financialFingerprint})=>{
   const before=await financialFingerprint();const {view,row}=await mount();fireEvent.click(row.getByRole('button',{name:'Suspended',exact:true}));fireEvent.click(view.getByRole('button',{name:'Confirm',exact:true}));
   await waitFor(()=>assert.equal(row.getByRole('button',{name:'Suspended',pressed:true}).disabled,true));
   const profile=(await db.query('select is_active,is_suspended from profiles where id=$1',[a])).rows[0];assert.equal(profile.is_active,true);assert.equal(profile.is_suspended,true);assert.equal(await financialFingerprint(),before);
  }));
  await t.test('Inactive also clears suspension and saves the inactive flags',()=>scenario(async({mount,db})=>{
   await db.query('update profiles set is_suspended=true where id=$1',[a]);const {row}=await mount();fireEvent.click(row.getByRole('button',{name:'Inactive',exact:true}));
   await waitFor(()=>assert.equal(row.getByRole('button',{name:'Inactive',pressed:true}).disabled,true));const profile=(await db.query('select is_active,is_suspended from profiles where id=$1',[a])).rows[0];assert.equal(profile.is_active,false);assert.equal(profile.is_suspended,false);
  }));
  await t.test('A failed save leaves the row active and shows an error',()=>scenario(async({mount,statuses})=>{
   const {view,row}=await mount();fireEvent.click(row.getByRole('button',{name:'Inactive',exact:true}));await view.findByRole('alert');assert.equal(row.getByRole('button',{name:'Active',pressed:true}).disabled,true);assert.equal(view.queryByRole('status'),null);
   assert.deepEqual(statuses,[500]);
  },{rpcFails:true}));
  await t.test('A competing change cannot produce a false success message',()=>scenario(async({mount,statuses})=>{
   const {view,row}=await mount();fireEvent.click(row.getByRole('button',{name:'Inactive',exact:true}));const error=await view.findByRole('alert');assert.match(error.textContent,/not saved/);assert.equal(view.queryByRole('status'),null);assert.equal(row.getByRole('button',{name:'Active',pressed:true}).disabled,true);
   assert.deepEqual(statuses,[409]);
  },{race:true}));
  await t.test('password form blocks mismatched confirmation and clears credentials after a verified change',async()=>{
   let calls=0;const Form=load('components/PasswordChangeForm.tsx').default;
   const route=load('app/api/account/password/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/auth':{requireUser:async()=>({user:{id:a,email:'fixture@example.invalid'},error:null})},
    '@/lib/supabase/server':{createClient:async()=>({auth:{signInWithPassword:async()=>({data:{user:{id:a}},error:null}),updateUser:async()=>({error:null}),signOut:async()=>({error:null})}})},
   });
   try{
    globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/account/password');return route.POST(new Request('https://tdx.test'+url,options));};
    const view=render(React.createElement(Form));const current=view.getByLabelText('Current password'),password=view.getByLabelText('New password',{exact:true}),confirmation=view.getByLabelText('Confirm new password');
    fireEvent.change(current,{target:{value:'fixture-old-password'}});fireEvent.change(password,{target:{value:'fixture-new-password'}});fireEvent.change(confirmation,{target:{value:'different-confirmation'}});
    fireEvent.submit(view.getByRole('form',{name:'Change password'}));assert.match(view.getByRole('alert').textContent,/do not match/);assert.equal(calls,0);
    fireEvent.change(confirmation,{target:{value:'fixture-new-password'}});fireEvent.submit(view.getByRole('form',{name:'Change password'}));await view.findByRole('status');assert.equal(calls,1);assert.equal(current.value,'');assert.equal(password.value,'');assert.equal(confirmation.value,'');
   }finally{cleanup();globalThis.fetch=originalFetch;}
  });
  await t.test('private pilot home and registration pages do not initialize public signup',async()=>{
   let networkCalls=0;const mocks={
    'next/link':({children,...props})=>React.createElement('a',props,children),
    '@/lib/pilot-mode':{PUBLIC_SIGNUP_ENABLED:false},
    '@/components/ui':{LanguageToggle:blank,GlassPanel:blank,GlowButton:blank},
    '@/lib/supabase/client':{createClient:()=>{throw Error('Public authentication must not initialize in pilot mode');}},
   };
   try{
    globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected public signup');};
    for(const file of ['app/page.tsx','app/register/page.tsx']){
     const Page=load(file,mocks).default;const view=render(React.createElement(Page));
     assert.ok(view.getByRole('heading',{name:'Private pilot'}));assert.ok(view.getByRole('link',{name:'Sign in'}));assert.equal(view.queryByRole('textbox'),null);assert.match(view.getByRole('main').textContent,/Do not send real payments/);if(file.includes('register'))assert.match(view.getByRole('status').textContent,/registration is currently closed/);cleanup();
    }
    assert.equal(networkCalls,0);
   }finally{cleanup();globalThis.fetch=originalFetch;}
  });
 }finally{globalThis.fetch=originalFetch;await db.close();dom.window.close();}
});
