import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const web = path.resolve(import.meta.dirname, "..");
class NextResponse extends Response {
  static json(body, init) { return Response.json(body, init); }
  static next() { return { kind: "next", cookies: cookieJar(), headers: new Headers() }; }
  static redirect(url) { return { kind: "redirect", url, cookies: cookieJar(), headers: new Headers() }; }
}
function cookieJar() {
  const values = [];
  return { set: (...args) => values.push(args.length === 1 ? args[0] : { name: args[0], value: args[1], ...args[2] }), getAll: () => values };
}
function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(web, relative);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  const require = (name) => {
    if (name in mocks) return mocks[name];
    if (name === "next/server") return { NextResponse };
    if (name === "node:crypto") return { createHmac, timingSafeEqual };
    if (name === "node:buffer") return { Buffer };
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts", mocks, globals);
    if (name === "nodemailer") return { createTransport() { throw new Error("Unexpected email delivery"); } };
    if (name === "@supabase/supabase-js") return { createClient() { throw new Error("Unexpected database call"); } };
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInNewContext(output, { exports, require, Response, Request, URL, console, process: { env: {} }, setTimeout, clearTimeout, AbortController, ...globals }, { filename });
  return exports;
}
const validation = load("lib/request-validation.ts");
const user = { id: "member-a" };
const okAuth = { requireUser: async () => ({ user, error: null }) };
function request(body) { return new Request("https://tdx.example/api/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }); }
const errorMocks = { internalError: () => Response.json({ error: "Request failed" }, { status: 500 }), escapeHtml: String, logServerWarn() {}, logServerError() {} };

test("JSON input rejects null, arrays, booleans, and scalar values", async () => {
  for (const value of [null, [], true, 12, "text"]) await assert.rejects(validation.readJsonObject(request(value)));
  assert.deepEqual(JSON.parse(JSON.stringify(await validation.readJsonObject(request({ a: 1 })))), { a: 1 });
});
test("JSON input rejects malformed JSON", async () => {
  await assert.rejects(validation.readJsonObject(new Request("https://tdx.example", { method: "POST", body: "{" })));
});
test("private object paths enforce ownership and prevent traversal and encoded separators", () => {
  assert.equal(validation.isOwnedObjectPath("member-a/receipt.jpg", user.id), true);
  for (const value of ["member-b/receipt.jpg", "member-a/../other.jpg", "member-a/sub/file.jpg", "member-a/..", "member-a/", "member-a/x\\y.jpg", "member-a/%2e%2e.jpg", "member-a/a\u0000.jpg", {}, null]) {
    assert.equal(validation.isOwnedObjectPath(value, user.id), false, String(value));
  }
});
test("cash payment dates must be real dates no later than today", () => {
  assert.equal(validation.isPastOrPresentDate("2026-10-29", "2026-10-29"), true);
  assert.equal(validation.isPastOrPresentDate("2024-02-29", "2026-10-29"), true);
  for (const value of ["2026-02-29", "2026-02-30", "2026-10-30", "10/28/2026", "", null, {}]) assert.equal(validation.isPastOrPresentDate(value, "2026-10-29"), false);
});
test("outbound push endpoints accept supported providers and reject SSRF targets", () => {
  for (const url of ["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns2.notify.windows.com/w/?token=x"]) assert.equal(validation.isTrustedPushEndpoint(url), true);
  for (const url of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.example/x", "https://evilnotify.windows.com/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://fcm.googleapis.com/x#y", "file:///etc/passwd", null]) assert.equal(validation.isTrustedPushEndpoint(url), false, String(url));
});
function authWith(profile, error = null, signedIn = true) {
  const client = { auth: { getUser: async () => ({ data: { user: signedIn ? user : null } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error }) }) }) }) };
  return load("lib/auth.ts", { "@/lib/supabase/server": { createClient: async () => client } });
}
test("API guard rejects expired sessions", async () => assert.equal((await authWith(null, null, false).requireUser()).error.status, 401));
test("API guard rejects suspended existing sessions", async () => assert.equal((await authWith({ role: "user", is_suspended: true }).requireUser()).error.status, 403));
test("API guard fails closed when profile is unavailable", async () => {
  assert.equal((await authWith(null).requireUser()).error.status, 503);
  assert.equal((await authWith(null, { code: "error" }).requireUser()).error.status, 503);
});
test("API guard preserves active member and admin access", async () => {
  assert.equal((await authWith({ role: "user", is_suspended: false }).requireUser()).user.id, user.id);
  assert.equal((await authWith({ role: "admin", is_suspended: true }).requireUser()).user.id, user.id);
});
for (const route of ["deposits", "chat", "push/subscribe", "push/send", "goals", "tasks/complete", "upgrades/request", "referral", "notifications", "admin/receipt", "admin/receipt/generate", "admin/payouts/process"]) {
  test(`${route}: JSON null returns 400 instead of crashing`, async () => {
    const subject = load(`app/api/${route}/route.ts`, {
      "@/lib/auth": okAuth,
      "@/lib/admin-auth": { requireAdmin: async () => ({ user, error: null }) },
      "@/lib/supabase/server": { createClient: async () => { throw new Error("Unexpected database call"); }, createServiceRoleClient: async () => { throw new Error("Unexpected database call"); } },
      "@/lib/push": { sendPushToSubscriptions: async () => { throw new Error("Unexpected push delivery"); } },
      "@/lib/api-errors": errorMocks,
    });
    assert.equal((await subject.POST(request(null))).status, 400);
  });
}
test("receipt picker reads the current schema without optional review columns or relationship embeds", async () => {
  const selections = [];
  const client = { from: (table) => ({
    select: (columns) => {
      selections.push({ table, columns });
      return {
        eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        order: () => ({ limit: async () => ({ data: table === "deposits" ? [{ id: "deposit-fixture", user_id: user.id, amount: 5000, status: "approved", uploaded_at: "2026-10-29" }] : [], error: null }) }),
        in: async () => ({ data: [{ id: user.id, full_name: "Fixture Member", username: "fixture" }], error: null }),
      };
    },
  }) };
  const route = load("app/api/admin/receipt/records/route.ts", { "@/lib/admin-auth": { requireAdmin: async () => ({ error: null }) }, "@/lib/supabase/server": { createServiceRoleClient: async () => client }, "@/lib/api-errors": errorMocks });
  const result = await route.GET(new Request("https://tdx.example/api/admin/receipt/records?type=deposit"));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).records[0].fullName, "Fixture Member");
  assert.ok(selections.every(({ columns }) => !/payment_method|reviewed_at|profiles\(/.test(columns)));
  const empty = await route.GET(new Request("https://tdx.example/api/admin/receipt/records?type=payout"));
  assert.deepEqual((await empty.json()).records, []);
  assert.equal((await route.GET(new Request("https://tdx.example/api/admin/receipt/records?type=invalid"))).status, 400);
});
test("receipt picker enforces admin access before querying financial data", async () => {
  const route = load("app/api/admin/receipt/records/route.ts", { "@/lib/admin-auth": { requireAdmin: async () => ({ error: Response.json({ error: "Forbidden" }, { status: 403 }) }) }, "@/lib/supabase/server": {}, "@/lib/api-errors": errorMocks });
  assert.equal((await route.GET(new Request("https://tdx.example/api/admin/receipt/records?type=deposit"))).status, 403);
});
test("deposit API rejects invalid amounts, receipt ownership, and impossible cash dates before writes", async () => {
  const subject = load("app/api/deposits/route.ts", { "@/lib/auth": okAuth, "@/lib/supabase/server": { createServiceRoleClient: async () => { throw new Error("Unexpected write"); } }, "@/lib/api-errors": errorMocks });
  for (const body of [{ amount: -1 }, { amount: 5000, receipt_image_url: "member-b/a.jpg" }, { amount: 5000, receipt_image_url: "member-a/../b.jpg" }, { amount: 5000, payment_method: "cash_agent", cash_agent_name: "Shakeela", cash_payment_date: "2026-02-30" }]) assert.equal((await subject.POST(request(body))).status, 400);
});
test("deposit API derives user, status, and allowed fields on the server", async () => {
  let inserted;
  const client = { from: () => ({ insert: (payload) => { inserted = payload; return { select: () => ({ single: async () => ({ data: { id: "deposit-fixture" }, error: null }) }) }; } }) };
  const subject = load("app/api/deposits/route.ts", { "@/lib/auth": okAuth, "@/lib/supabase/server": { createServiceRoleClient: async () => client }, "@/lib/api-errors": errorMocks });
  const response = await subject.POST(request({ amount: 5000, receipt_image_url: "member-a/a.jpg", user_id: "other", status: "approved", approved_at: "2026-01-01" }));
  assert.equal(response.status, 200);
  assert.equal(inserted.user_id, user.id);
  assert.equal(inserted.status, "pending");
  assert.equal(inserted.approved_at, undefined);
});
test("cron fails closed when CRON_SECRET is absent", async () => {
  const subject = load("app/api/cron/payout-reminders/route.ts", { "@/lib/api-errors": errorMocks });
  assert.equal((await subject.GET(new Request("https://tdx.example/api/cron/payout-reminders", { headers: { authorization: "Bearer undefined" } }))).status, 401);
});
test("protected SMTP connection check does not send email or queue reminders",async()=>{
  let checked=false;
  const subject=load("app/api/cron/payout-reminders/route.ts",{nodemailer:{createTransport:()=>({verify:async()=>{checked=true;},close:()=>{}})},"@/lib/api-errors":errorMocks},{process:{env:{CRON_SECRET:"fixture",NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"fixture",SMTP_USER:"sender@example.test",SMTP_PASS:"fixture"}}});
  const response=await subject.GET(new Request("https://tdx.example/api/cron/payout-reminders?check=email",{headers:{authorization:"Bearer fixture"}}));
  assert.equal(response.status,200);assert.equal(checked,true);
});
test("scheduler signatures expire and cannot be reused for another method or query",()=>{
  const subject=load("lib/reminder-auth.ts");
  const secret="synthetic-only-credential",nonce="00000000-0000-4000-8000-000000000001";
  const signed=(timestamp,method="GET",query="")=>{
    const signature=createHmac("sha256",secret).update(`${method}:/api/cron/payout-reminders${query}:${timestamp}:${nonce}`).digest("hex");
    return new Request(`https://tdx.example/api/cron/payout-reminders${query}`,{method,headers:{authorization:`TDX-HMAC ${timestamp}.${nonce}.${signature}`}});
  };
  const timestamp=Math.floor(Date.now()/1000);
  assert.equal(subject.validReminderAuthorization(signed(timestamp),secret),true);
  assert.equal(subject.validReminderAuthorization(signed(timestamp-121),secret),false);
  assert.equal(subject.validReminderAuthorization(signed(timestamp+121),secret),false);
  assert.equal(subject.validReminderAuthorization(signed(timestamp),"different-secret"),false);
  const altered=signed(timestamp);assert.equal(subject.validReminderAuthorization(new Request(altered.url+"?check=email",{headers:altered.headers}),secret),false);
  assert.equal(subject.validReminderAuthorization(new Request(altered.url,{method:"POST",headers:altered.headers}),secret),false);
});
for (const deliveryFails of [false,true]) test(`reminder email ${deliveryFails ? "failure is retryable" : "success is acknowledged"}`,async()=>{
  let acknowledgement,closed=false;
  const client={rpc:async(name,args)=>name==="queue_payout_reminders"?{data:{queued:2,in_app_sent:1},error:null}:name==="claim_payout_reminder_emails"?{data:[{id:"fixture-job",claim_token:"fixture-token",member_name:"Synthetic Member",cycle_end:"2026-10-31T10:00:00Z",stage:"24h"}],error:null}:(acknowledgement=args,{data:true,error:null})};
  const transporter={sendMail:async()=>{if(deliveryFails)throw new Error("Synthetic SMTP failure");return {accepted:["admin@example.test"]};},close:()=>{closed=true;}};
  const subject=load("app/api/cron/payout-reminders/route.ts",{"@supabase/supabase-js":{createClient:()=>client},nodemailer:{createTransport:()=>transporter},"@/lib/api-errors":errorMocks},{process:{env:{CRON_SECRET:"fixture",NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"fixture",SMTP_USER:"sender@example.test",SMTP_PASS:"fixture",ADMIN_EMAIL:"admin@example.test"}}});
  const response=await subject.GET(new Request("https://tdx.example/api/cron/payout-reminders",{headers:{authorization:"Bearer fixture"}}));
  assert.equal(response.status,deliveryFails?503:200);
  assert.equal(acknowledgement.p_success,!deliveryFails);assert.equal(closed,true);
  assert.equal((await response.json()).email_failed,deliveryFails?1:0);
});
test("proxy blocks cross-origin mutations and permits same-origin or authenticated non-browser requests", async () => {
  const subject = load("proxy.ts", { "@/lib/supabase/middleware": { updateSession: async () => ({ kind: "session", headers: new Headers() }) } });
  const req = (origin, site) => ({ method: "POST", nextUrl: new URL("https://tdx.example/api/goals"), headers: new Headers({ ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) }) });
  assert.equal((await subject.proxy(req("https://evil.example"))).status, 403);
  assert.equal((await subject.proxy(req(null, "cross-site"))).status, 403);
  assert.equal((await subject.proxy(req("https://tdx.example"))).kind, "next");
  assert.equal((await subject.proxy(req(null))).kind, "next");
  assert.match((await subject.proxy(req(null))).headers.get("cache-control"),/private.*no-store/);
});
test("member pages fail closed when the service configuration is missing",async()=>{
  const subject=load("lib/supabase/middleware.ts",{"@supabase/ssr":{} });
  const response=await subject.updateSession({nextUrl:new URL("https://tdx.example/dashboard")});
  assert.equal(response.status,503);
});
test("session refresh cookies survive protected-page redirects", async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key" };
  const subject = load("lib/supabase/middleware.ts", { "@supabase/ssr": { createServerClient: (_u, _k, options) => ({ auth: { getUser: async () => { options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true } }]); return { data: { user: null } }; } } }) } }, { process: { env } });
  for (const route of ["/dashboard", "/profile", "/goals", "/statement", "/invoice/fixture"]) {
    const nextUrl = new URL(`https://tdx.example${route}`); nextUrl.clone = () => new URL(nextUrl);
    const result = await subject.updateSession({ nextUrl, cookies: cookieJar() });
    assert.equal(result.kind, "redirect");
    assert.equal(result.url.pathname, "/login");
    assert.equal(result.cookies.getAll()[0].value, "refreshed");
  }
});
test("notification clicks keep navigation inside TDX", async () => {
  const handlers = {};
  let opened;
  vm.runInNewContext(fs.readFileSync(path.join(web, "public/sw.js"), "utf8"), { URL, self: { location: { origin: "https://tdx.example" }, addEventListener: (name, fn) => { handlers[name] = fn; } }, clients: { matchAll: async () => [], openWindow: async (url) => { opened = url; } } });
  let pending;
  handlers.notificationclick({ notification: { close() {}, data: { url: "https://evil.example/phishing" } }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(opened, "https://tdx.example/");
});

test("receipt sharing supports every requested destination without putting member details in external URLs", async () => {
  const receipt = load("lib/receipt-export.ts");
  assert.deepEqual(Array.from(receipt.RECEIPT_SHARE_TARGETS), ["WhatsApp", "Facebook", "Instagram", "TikTok", "Email"]);
  const file = new File(["fixture"], "receipt.png", { type: "image/png" });
  let payload;
  assert.equal(await receipt.shareReceiptFile(file, { canShare: () => true, share: async (value) => { payload = value; } }), "shared");
  assert.equal(payload.files[0], file);
  assert.equal(payload.url, undefined);
  assert.equal(await receipt.shareReceiptFile(file, { canShare: () => false }), "unsupported");
  assert.equal(await receipt.shareReceiptFile(file, { canShare: () => true, share: async () => { throw { name: "AbortError" }; } }), "cancelled");
  assert.equal(await receipt.shareReceiptFile(file, { canShare: () => true, share: async () => { throw new Error("unsupported"); } }), "unsupported");
});
test("receipt exports preserve every field, reject invented rates, and handle invalid dates", () => {
  const receipt = load("lib/receipt-export.ts");
  const data = { type: "deposit", id: "fixture-id", user: "Fixture", mobile: "fixture-mobile", username: "fixture-user", city: "Fixture City", amount: 5000, status: "approved", date: "invalid", percentage: 90, language: "en" };
  const fields = new Map(receipt.receiptRows(data, false));
  assert.equal(fields.get("Member"), "Fixture");
  assert.equal(fields.get("City"), "Fixture City");
  assert.equal(fields.get("Amount"), "Rs 5,000");
  assert.equal(fields.get("Date"), "—");
  assert.equal(fields.has("Percentage"), false);
  assert.equal(receipt.receiptFilename({ ...data, id: "../../test" }, "png").includes("/"), false);
});

test("admin support messages reject non-text and oversized input before database writes", async () => {
  const subject = load("app/api/admin/chat/route.ts", { "@/lib/admin-auth": { requireAdmin: async () => ({ user, error: null }) }, "@/lib/supabase/server": { createServiceRoleClient: async () => { throw new Error("Unexpected write"); } } });
  for (const text of [12, {}, [], " ", "x".repeat(4001)]) assert.equal((await subject.POST(request({ userId: "fixture", text }))).status, 400);
});

for (const available of [true, false]) test(`readiness endpoint reports ${available ? "ready" : "unavailable"} without exposing database details`, async () => {
  const subject = load("app/api/health/route.ts", { "@supabase/supabase-js": { createClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: available ? null : { message: "PRIVATE DATABASE DETAIL" } }) }) }) }) } }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" } } });
  const response = await subject.GET();
  assert.equal(response.status, available ? 200 : 503);
  assert.equal((await response.json()).status, available ? "ok" : "unavailable");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

function invoiceSubject(viewer, owner = user.id) {
  const filters = [];
  let profileReads = 0;
  const query = { eq(key, value) { filters.push([key, value]); return query; }, single: async () => ({ data: filters.some(([key, value]) => key === "user_id" && value !== owner) ? null : { id: "fixture", user_id: owner, amount: 5000, status: "approved", uploaded_at: "2026-10-29" }, error: null }) };
  const client = { from(table) { return { select() { if (table === "deposits") return query; profileReads++; return { eq: () => ({ single: async () => ({ data: { full_name: "Fixture", username: "fixture" }, error: null }) }) }; } }; } };
  const navigate = (url) => { throw new Error(`redirect:${url}`); };
  const page = load("app/invoice/[depositId]/page.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { redirect: navigate, notFound: () => { throw new Error("not-found"); } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "en" }) }) },
    "next/link": { __esModule: true, default: "Link" },
    "@/components/ReceiptGenerator": { __esModule: true, default: "ReceiptGenerator" },
    "@/components/PrintButton": { __esModule: true, default: "PrintButton" },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: viewer, error: null }) }) }) }) }), createServiceRoleClient: async () => client },
  });
  return { render: () => page.default({ params: Promise.resolve({ depositId: "fixture" }) }), filters, profileReads: () => profileReads };
}
test("member invoice loads only the owner's receipt and uses the shared receipt renderer", async () => {
  const subject = invoiceSubject({ role: "user", is_suspended: false });
  const result = await subject.render();
  assert.ok(subject.filters.some(([key, value]) => key === "user_id" && value === user.id));
  assert.match(JSON.stringify(result), /ReceiptGenerator/);
  assert.equal(subject.profileReads(), 1);
});
test("another member's invoice is unavailable before private profile details are read", async () => {
  const subject = invoiceSubject({ role: "user", is_suspended: false }, "other-member");
  await assert.rejects(subject.render(), /not-found/);
  assert.equal(subject.profileReads(), 0);
});
test("suspended members cannot open invoice downloads directly", async () => {
  const subject = invoiceSubject({ role: "user", is_suspended: true });
  await assert.rejects(subject.render(), /redirect:\/dashboard/);
  assert.equal(subject.profileReads(), 0);
});
test("financial reporting uses Pakistan calendar boundaries including the quarter and six-month window", () => {
  const { reportStart } = load("lib/report-period.ts");
  const now = new Date("2026-10-29T10:00:00Z");
  for (const [period, expected] of Object.entries({ daily: "2026-10-28T19:00:00.000Z", weekly: "2026-10-22T19:00:00.000Z", monthly: "2026-09-30T19:00:00.000Z", quarterly: "2026-09-30T19:00:00.000Z", "6months": "2026-04-30T19:00:00.000Z", yearly: "2025-12-31T19:00:00.000Z" })) assert.equal(reportStart(period, now).toISOString(), expected);
});
test("account balances exclude rejected withdrawals, unearned profits, and returned principal", () => {
  const { computeSummaryTotals } = load("lib/account-summary.ts");
  const deposits = [{ amount: 5000, status: "approved" }];
  const profits = [{ amount: 400, status: "paid" }, { amount: 10000, status: "pending" }];
  const withdrawals = [{ amount: 400, status: "completed" }, { amount: 100, status: "pending" }, { amount: 9000, status: "rejected" }];
  const profile = { investment_amount: 5000, total_deductions: 0 };
  const balance = computeSummaryTotals(profile, deposits, profits, withdrawals);
  assert.equal(balance.totalProfit, 400);
  assert.equal(balance.totalWithdrawn, 400);
  assert.equal(balance.totalBalance, 5000);
  assert.equal(balance.withdrawableBalance, 4900);
  const returned = computeSummaryTotals(profile, deposits, profits, withdrawals, [{ amount: 5000, status: "completed" }]);
  assert.equal(returned.totalBalance, 0);
  assert.equal(returned.withdrawableBalance, 0);
  assert.equal(returned.activeInvestment, 0);
});
test("statement outages return an error instead of fabricated zero balances",async()=>{
  const result={data:null,error:{message:"Synthetic private database failure"}};
  const subject=load("app/api/statements/route.ts",{"@/lib/auth":okAuth,"@/lib/supabase/server":{createClient:async()=>({rpc:async()=>result})},"@/lib/api-errors":errorMocks});
  assert.equal((await subject.GET()).status,500);
  result.error=null;assert.equal((await subject.GET()).status,404);
});
test("payout receipts use the actual completed withdrawal, net payment, fee and selected rate", async () => {
  const id = "00000000-0000-4000-8000-000000000011";
  const client = { from: (table) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: table === "withdrawals" ? { id, user_id: user.id, amount: 400, net_amount: 300, fee: 100, status: "completed", monthly_profit_rate: 8, processed_at: "2026-10-30T10:00:00Z", cycle_end: "2026-10-31T00:00:00Z" } : null, error: null }),
    single: async () => ({ data: { full_name: "Fixture", username: "fixture" }, error: null }),
  }) }) }) };
  const subject = load("app/api/admin/receipt/generate/route.ts", { "@/lib/admin-auth": { requireAdmin: async () => ({ user, error: null }) }, "@/lib/supabase/server": { createServiceRoleClient: async () => client }, "@/lib/api-errors": errorMocks });
  const response = await subject.POST(request({ type: "payout", id, language: "en" }));
  assert.equal(response.status, 200);
  const { receipt } = await response.json();
  assert.equal(receipt.amount, 300);
  assert.equal(receipt.grossAmount, 400);
  assert.equal(receipt.fee, 100);
  assert.equal(receipt.percentage, 8);
  assert.equal(receipt.recordKind, "transaction");
  assert.equal(receipt.date, "2026-10-30T10:00:00Z");
});
test("admin deposit decisions use the session actor and one atomic RPC", async () => {
  let parameters;
  const client = { rpc: async (name, args) => { assert.equal(name, "admin_decide_deposit"); parameters = args; return { data: { ok: true, status: "approved", cycle_start: "2026-10-31" }, error: null }; } };
  const subject = load("app/api/admin/deposits/route.ts", { "@/lib/admin-auth": { requireAdmin: async () => ({ user, error: null }) }, "@/lib/supabase/server": { createServiceRoleClient: async () => client }, "@/lib/api-errors": errorMocks });
  const response = await subject.POST(request({ depositId: "00000000-0000-4000-8000-000000000011", action: "approve", p_actor: "forged" }));
  assert.equal(response.status, 200);
  assert.equal(parameters.p_actor, user.id);
  assert.equal((await subject.POST(request({ depositId: {}, action: "approve" }))).status, 400);
});
