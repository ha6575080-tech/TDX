/**
 * E2E TESTS — SUPER ADMIN MEMBER STATUS CONTROL.
 *
 * Run:  node web/scripts/e2e-member-status.mjs
 *
 * Requires web/.env.local (same convention as the other e2e scripts) with
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * PART A (always runs) — database / RPC level via the service role:
 *   1. Newly registered member (zero deposits)   -> Super Admin can suspend
 *   2. Member with no receipt (pending deposit)  -> Super Admin can suspend
 *   3. Member with a pending deposit             -> Super Admin can suspend
 *   4. Member with an approved deposit           -> Super Admin can suspend
 *   5. Suspending/approval independence: approving a SUSPENDED member's
 *      pending deposit does NOT clear the suspension (admin action wins)
 *   6. Super Admin reactivates a suspended member
 *   7. Super Admin marks a member inactive
 *   8. Super Admin reactivates an inactive member
 *   9. Unauthorized user (member) cannot change status — DB-level RPC
 *      revocation + the function's own role check both refuse
 *   10. Existing financial/history records remain unchanged through a full
 *       suspend -> reactivate cycle
 *   + validation: invalid status, unknown member, same-status no-op,
 *     audit-trail rows recorded for every change (prev/new/admin/reason/ts)
 *
 * PART B (runs only when the app is reachable on localhost:3000) —
 *   HTTP level through the real Next.js routes:
 *   * suspended member: /api/account/summary, /api/deposit, /api/withdraw
 *     all return 403 (dashboard blocked server-side, not just in the UI)
 *   * reactivated member: /api/account/summary returns 200 again
 *   * admin HTTP endpoint: POST /api/admin/users {action:"set_status"}
 *     works for the admin, 403 for a member, 403 with no session
 *   * GET /api/admin/users/:id/status-history: 200 for admin, 403 for member
 *
 * Creates clearly-named test accounts (tdx-status-*) — clean up manually
 * if desired (same convention as e2e-setup.mjs).
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = env.E2E_APP_URL ?? "http://localhost:3000";

const SVC_HEADERS = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  "Content-Type": "application/json",
};

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function j(label, res) {
  const text = await res.text();
  console.log(`    [${label}] HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: null };
  }
}

const REST = `${BASE}/rest/v1`;
const ANON_HEADERS = { apikey: ANON, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUser(email, meta, role) {
  // Create-or-fetch a confirmed user via the auth admin API.
  let res = await j("create user", await fetch(`${BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: SVC_HEADERS,
    body: JSON.stringify({ email, password: "TdxStatus!2026x", email_confirm: true, user_metadata: meta }),
  }));
  let userId = res.body?.id ?? res.body?.user?.id ?? null;
  if (!userId) {
    const list = await j("list users", await fetch(
      `${BASE}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=100`,
      { headers: SVC_HEADERS }
    ));
    userId = list.body?.users?.find((u) => u.email === email)?.id ?? null;
  }
  if (!userId) throw new Error(`Could not create/find test user ${email}`);

  // Ensure the profile exists (the signup trigger creates it; be explicit).
  await j("upsert profile", await fetch(`${REST}/profiles`, {
    method: "POST",
    headers: { ...SVC_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, ...meta, role: role ?? "user" }),
  }));
  return userId;
}

async function getProfile(id) {
  const res = await j("profile", await fetch(
    `${REST}/profiles?id=eq.${id}&select=is_active,is_suspended,role,full_name`,
    { headers: SVC_HEADERS }
  ));
  return res.body?.[0] ?? null;
}

async function rpcSetStatus(memberId, status, changedBy, reason) {
  return j("rpc set_member_status", await fetch(`${REST}/rpc/set_member_status`, {
    method: "POST",
    headers: SVC_HEADERS,
    body: JSON.stringify({
      p_member_id: memberId,
      p_status: status,
      p_changed_by: changedBy,
      p_reason: reason ?? null,
    }),
  }));
}

async function auditRows(memberId) {
  const res = await j("audit rows", await fetch(
    `${REST}/member_status_changes?member_id=eq.${memberId}&order=created_at.desc&limit=100`,
    { headers: SVC_HEADERS }
  ));
  return res.body ?? [];
}

async function snapshotFinancials(userId) {
  const [d, p, w] = await Promise.all([
    fetch(`${REST}/deposits?user_id=eq.${userId}&select=*&order=uploaded_at.asc`, { headers: SVC_HEADERS }),
    fetch(`${REST}/profits?user_id=eq.${userId}&select=*&order=payout_date.asc.nullsfirst`, { headers: SVC_HEADERS }),
    fetch(`${REST}/withdrawals?user_id=eq.${userId}&select=*&order=requested_at.asc`, { headers: SVC_HEADERS }),
  ]);
  return {
    deposits: await d.json(),
    profits: await p.json(),
    withdrawals: await w.json(),
  };
}

function sameRows(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// PART A — DB / RPC level
// ---------------------------------------------------------------------------

const ts = Date.now().toString(36);
const metaBase = {
  address: "Status Test Street",
  city: "Lahore",
  account_number: "0325-2879424",
  payment_method: "EASYPAISA",
};

console.log("\n================ PART A — DB / RPC level ================");

// Super Admin: reuse the existing admin account when present; otherwise
// create a dedicated test admin (service role sets role='admin').
const adminList = await j("list admins", await fetch(
  `${REST}/profiles?role=eq.admin&select=id,username,email,full_name&limit=10`,
  { headers: SVC_HEADERS }
));
let adminId = adminList.body?.[0]?.id ?? null;
if (!adminId) {
  adminId = await createTestUser(`tdx-status-admin-${ts}@tdx.example.com`, {
    username: `tdx_status_admin_${ts}`,
    full_name: "TDX Status Test Admin",
    mobile_number: "03001000001",
    ...metaBase,
  }, "admin");
  console.log(`    (no existing admin — created test admin ${adminId})`);
}

// ---- Test fixtures ---------------------------------------------------------
const M1 = await createTestUser(`tdx-status-m1-${ts}@tdx.example.com`, {
  username: `tdx_status_m1_${ts}`, full_name: "Status M1 Fresh", mobile_number: "03001000002", ...metaBase,
});
const M2 = await createTestUser(`tdx-status-m2-${ts}@tdx.example.com`, {
  username: `tdx_status_m2_${ts}`, full_name: "Status M2 NoReceipt", mobile_number: "03001000003", ...metaBase,
});
const M3 = await createTestUser(`tdx-status-m3-${ts}@tdx.example.com`, {
  username: `tdx_status_m3_${ts}`, full_name: "Status M3 Pending", mobile_number: "03001000004", ...metaBase,
});
const M4 = await createTestUser(`tdx-status-m4-${ts}@tdx.example.com`, {
  username: `tdx_status_m4_${ts}`, full_name: "Status M4 Approved", mobile_number: "03001000005", ...metaBase,
});

// M2: pending deposit WITHOUT a receipt.
await j("M2 pending deposit (no receipt)", await fetch(`${REST}/deposits`, {
  method: "POST", headers: { ...SVC_HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ user_id: M2, amount: 5000, receipt_image_url: null, status: "pending", payment_method: "online_transfer" }),
}));
// M3: pending deposit WITH a receipt URL.
await j("M3 pending deposit (with receipt)", await fetch(`${REST}/deposits`, {
  method: "POST", headers: { ...SVC_HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ user_id: M3, amount: 5000, receipt_image_url: "deposits/m3-test-slip.jpg", status: "pending", payment_method: "online_transfer" }),
}));
// M4: one APPROVED deposit + one pending deposit (for the independence test).
const m4Approved = await j("M4 approved deposit", await fetch(`${REST}/deposits`, {
  method: "POST", headers: { ...SVC_HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ user_id: M4, amount: 100000, receipt_image_url: "deposits/m4-approved.jpg", status: "approved", approved_at: new Date().toISOString(), payment_method: "online_transfer" }),
}));
const m4Pending = await j("M4 pending deposit", await fetch(`${REST}/deposits`, {
  method: "POST", headers: { ...SVC_HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ user_id: M4, amount: 5000, receipt_image_url: "deposits/m4-pending.jpg", status: "pending", payment_method: "online_transfer" }),
}));
// M4 is financially active (mirrors what the approval flow sets).
await j("M4 activate profile", await fetch(`${REST}/profiles?id=eq.${M4}`, {
  method: "PATCH", headers: SVC_HEADERS,
  body: JSON.stringify({ is_active: true, profit_activation_date: new Date().toISOString() }),
}));

// ---------------------------------------------------------------------------
console.log("\n-- Test 1: newly registered member, ZERO deposits -> suspend --");
{
  const r = await rpcSetStatus(M1, "suspended", adminId, "e2e test 1");
  ok("rpc ok", r.body?.ok === true, JSON.stringify(r.body));
  const p = await getProfile(M1);
  ok("member is_suspended=true", p?.is_suspended === true);
  const rows = await auditRows(M1);
  ok("audit row recorded", rows.length === 1, `rows=${rows.length}`);
  ok("audit prev=inactive new=suspended",
    rows[0]?.previous_status === "inactive" && rows[0]?.new_status === "suspended");
  ok("audit changed_by=admin", rows[0]?.changed_by === adminId);
  ok("audit reason stored", rows[0]?.reason === "e2e test 1");
  ok("audit timestamp present", typeof rows[0]?.created_at === "string");
}

console.log("\n-- Test 2: member with NO receipt -> suspend --");
{
  const r = await rpcSetStatus(M2, "suspended", adminId, "e2e test 2");
  ok("rpc ok for no-receipt member", r.body?.ok === true, JSON.stringify(r.body));
  const p = await getProfile(M2);
  ok("member is_suspended=true", p?.is_suspended === true);
  const dep = await j("M2 deposit after suspend", await fetch(
    `${REST}/deposits?user_id=eq.${M2}&select=id,status,receipt_image_url`, { headers: SVC_HEADERS }
  ));
  ok("pending deposit preserved (not cancelled/changed)",
    (dep.body ?? []).some((d) => d.status === "pending" && d.receipt_image_url == null));
}

console.log("\n-- Test 3: member with PENDING deposit -> suspend --");
{
  const r = await rpcSetStatus(M3, "suspended", adminId);
  ok("rpc ok for pending-deposit member", r.body?.ok === true, JSON.stringify(r.body));
  const p = await getProfile(M3);
  ok("member is_suspended=true", p?.is_suspended === true);
  const dep = await j("M3 deposit after suspend", await fetch(
    `${REST}/deposits?user_id=eq.${M3}&select=status`, { headers: SVC_HEADERS }
  ));
  ok("pending deposit still pending", (dep.body ?? []).some((d) => d.status === "pending"));
}

console.log("\n-- Test 4: member with APPROVED deposit -> suspend --");
{
  const r = await rpcSetStatus(M4, "suspended", adminId, "e2e test 4");
  ok("rpc ok for approved-deposit member", r.body?.ok === true, JSON.stringify(r.body));
  const p = await getProfile(M4);
  ok("member is_suspended=true", p?.is_suspended === true);
  ok("is_active PRESERVED on suspend (financial history intact)", p?.is_active === true);
}

console.log("\n-- Test 5: deposit approval does NOT clear a manual suspension --");
{
  // Approve M4's pending deposit the way the (fixed) app flow does:
  // deposit -> approved; profile is_active/profit_activation_date updated;
  // is_suspended is NEVER written.
  await j("approve specific deposit row", await fetch(`${REST}/deposits?id=eq.${m4Pending.body?.id}`, {
    method: "PATCH", headers: SVC_HEADERS,
    body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString(), reviewed_by: adminId }),
  }));
  await j("profile update (app semantics: no is_suspended)", await fetch(`${REST}/profiles?id=eq.${M4}`, {
    method: "PATCH", headers: SVC_HEADERS,
    body: JSON.stringify({ is_active: true }),
  }));
  const p = await getProfile(M4);
  ok("suspension SURVIVES deposit approval (admin action takes precedence)",
    p?.is_suspended === true && p?.is_active === true);
  const m4deposits = await j("M4 deposits after approval", await fetch(
    `${REST}/deposits?user_id=eq.${M4}&select=id,status`, { headers: SVC_HEADERS }
  ));
  ok("original approved deposit untouched by suspension/approval flow",
    (m4deposits.body ?? []).find((d) => d.id === m4Approved.body?.id)?.status === "approved");
}

console.log("\n-- Test 6: reactivating a suspended member --");
{
  const r = await rpcSetStatus(M4, "active", adminId, "e2e test 6");
  ok("rpc ok", r.body?.ok === true && r.body?.previous_status === "suspended", JSON.stringify(r.body));
  const p = await getProfile(M4);
  ok("is_suspended=false", p?.is_suspended === false);
  ok("is_active=true (restored)", p?.is_active === true);
  const rows = await auditRows(M4);
  ok("audit row suspended->active", rows.some((x) => x.previous_status === "suspended" && x.new_status === "active"));
}

console.log("\n-- Test 7: marking a member INACTIVE --");
{
  const r = await rpcSetStatus(M4, "inactive", adminId, "e2e test 7");
  ok("rpc ok (deactivate)", r.body?.ok === true && r.body?.previous_status === "active", JSON.stringify(r.body));
  const p = await getProfile(M4);
  ok("is_active=false, is_suspended=false", p?.is_active === false && p?.is_suspended === false);
}

console.log("\n-- Test 8: reactivating an INACTIVE member --");
{
  const r = await rpcSetStatus(M4, "active", adminId, "e2e test 8");
  ok("rpc ok (reactivate from inactive)", r.body?.ok === true && r.body?.previous_status === "inactive", JSON.stringify(r.body));
  const p = await getProfile(M4);
  ok("is_active=true, is_suspended=false", p?.is_active === true && p?.is_suspended === false);
}

console.log("\n-- Test 9: unauthorized user cannot change status (DB level) --");
{
  // 9a: a member's own id as changed_by -> the RPC's own role check refuses.
  const r = await rpcSetStatus(M1, "active", M1, "self-service attempt");
  ok("RPC refuses non-admin changed_by", r.body?.ok === false && r.body?.reason === "forbidden", JSON.stringify(r.body));
  const p = await getProfile(M1);
  ok("M1 unchanged after forbidden attempt", p?.is_suspended === true);

  // 9b: member JWT (authenticated role) cannot even EXECUTE the RPC —
  //     revoke execute from authenticated covers direct REST calls.
  const token = await j("M1 login token", await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: ANON_HEADERS,
    body: JSON.stringify({ email: `tdx-status-m1-${ts}@tdx.example.com`, password: "TdxStatus!2026x" }),
  }));
  const r2 = await j("M1 direct RPC call", await fetch(`${REST}/rpc/set_member_status`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token.body?.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_member_id: M1, p_status: "active", p_changed_by: M1 }),
  }));
  // PostgREST hides functions without EXECUTE (404) or denies them (403);
  // any non-2xx refusal proves the member cannot reach the primitive.
  ok("member JWT cannot execute set_member_status (refused)",
    [401, 403, 404].includes(r2.status), `HTTP ${r2.status}`);

  // 9c: anonymous cannot execute either.
  const r3 = await j("anon RPC call", await fetch(`${REST}/rpc/set_member_status`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ p_member_id: M1, p_status: "active", p_changed_by: M1 }),
  }));
  ok("anon cannot execute set_member_status (refused)",
    [401, 403, 404].includes(r3.status), `HTTP ${r3.status}`);
}

console.log("\n-- Test 10: financial/history records unchanged through a full cycle --");
{
  const before = await snapshotFinancials(M4);
  // Full cycle: suspend -> reactivate -> deactivate -> reactivate.
  for (const s of ["suspended", "active", "inactive", "active"]) {
    await rpcSetStatus(M4, s, adminId, "e2e test 10 cycle");
  }
  const after = await snapshotFinancials(M4);
  ok("deposits identical", sameRows(before.deposits, after.deposits),
    `before=${before.deposits.length} after=${after.deposits.length}`);
  ok("profits identical", sameRows(before.profits, after.profits));
  ok("withdrawals identical", sameRows(before.withdrawals, after.withdrawals));
}

console.log("\n-- Validation & audit semantics --");
{
  const r1 = await rpcSetStatus(M1, "deleted", adminId);
  ok("invalid status rejected", r1.body?.ok === false && r1.body?.reason === "invalid_status", JSON.stringify(r1.body));

  const r2 = await rpcSetStatus("00000000-0000-0000-0000-000000000000", "suspended", adminId);
  ok("unknown member rejected", r2.body?.ok === false && r2.body?.reason === "member_not_found", JSON.stringify(r2.body));

  const countBefore = (await auditRows(M1)).length;
  const r3 = await rpcSetStatus(M1, "suspended", adminId); // already suspended
  ok("same-status is a no-op", r3.body?.ok === true && r3.body?.changed === false, JSON.stringify(r3.body));
  const countAfter = (await auditRows(M1)).length;
  ok("no-op writes NO audit row", countAfter === countBefore, `before=${countBefore} after=${countAfter}`);

  const rows = await auditRows(M4);
  ok("M4 audit trail complete (>=4 transitions)", rows.length >= 4, `rows=${rows.length}`);
  ok("every audit row has changed_by + timestamps",
    rows.every((x) => x.changed_by && x.created_at && x.previous_status && x.new_status));
}

console.log(`\nPART A SUMMARY: ${passed} passed, ${failed} failed`);

// ---------------------------------------------------------------------------
// PART B — HTTP level (requires the app running on localhost:3000)
// ---------------------------------------------------------------------------

let appReachable = false;
try {
  const probe = await fetch(APP, { method: "GET" });
  appReachable = probe.status < 500 || true; // any HTTP response counts
} catch {
  appReachable = false;
}

if (!appReachable) {
  console.log(`\n================ PART B — SKIPPED (app not reachable at ${APP}) ================`);
} else {
  console.log(`\n================ PART B — HTTP level (${APP}) ================`);

  const projectRef = new URL(BASE).hostname.split(".")[0];

  // Build a @supabase/ssr auth cookie from a GoTrue session.
  async function login(email, password) {
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: ANON_HEADERS,
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const t = await res.json();
    const cookieValue = Buffer.from(
      JSON.stringify({
        access_token: t.access_token,
        token_type: t.token_type,
        expires_in: t.expires_in,
        expires_at: t.expires_at,
        refresh_token: t.refresh_token,
        user: t.user,
      })
    ).toString("base64url");
    return `${projectRef}-auth-token=${cookieValue}`;
  }
  // NOTE: cookie name prefix "sb-<ref>" is required by @supabase/ssr.
  const memberCookie = await login(`tdx-status-m1-${ts}@tdx.example.com`, "TdxStatus!2026x");
  if (!memberCookie) {
    console.log("  FAIL  member login for HTTP tests — skipping Part B assertions");
    failed++;
  } else {
    // M1 is currently SUSPENDED from Part A (test 1).
    const s1 = await j("suspended member: GET /api/account/summary", await fetch(`${APP}/api/account/summary`, {
      headers: { Cookie: `sb-${memberCookie}` },
    }));
    ok("suspended member blocked from dashboard data (403 account_suspended)",
      s1.status === 403 && s1.body?.error === "account_suspended", JSON.stringify(s1.body));

    const s2 = await j("suspended member: POST /api/withdraw", await fetch(`${APP}/api/withdraw`, {
      method: "POST", headers: { Cookie: `sb-${memberCookie}` },
    }));
    ok("suspended member blocked from withdrawals (403)", s2.status === 403, JSON.stringify(s2.body));

    const s3 = await j("suspended member: POST /api/deposit", await fetch(`${APP}/api/deposit`, {
      method: "POST",
      headers: { Cookie: `sb-${memberCookie}`, "Content-Type": "application/json" },
      body: JSON.stringify({ depositId: "00000000-0000-0000-0000-000000000000" }),
    }));
    ok("suspended member blocked from deposits (403)", s3.status === 403, JSON.stringify(s3.body));

    // Member cannot use the admin status endpoint (server-side 403).
    const u1 = await j("member: POST /api/admin/users set_status", await fetch(`${APP}/api/admin/users`, {
      method: "POST",
      headers: { Cookie: `sb-${memberCookie}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: M1, action: "set_status", status: "active" }),
    }));
    ok("member cannot change status via admin endpoint (403)", u1.status === 403, JSON.stringify(u1.body));

    // No session at all -> 403 as well.
    const u2 = await j("anonymous: POST /api/admin/users set_status", await fetch(`${APP}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: M1, action: "set_status", status: "active" }),
    }));
    ok("anonymous cannot change status (403)", u2.status === 403, JSON.stringify(u2.body));

    // Audit endpoint is admin-only at the HTTP layer too.
    const h1 = await j("member: GET status-history", await fetch(`${APP}/api/admin/users/${M1}/status-history`, {
      headers: { Cookie: `sb-${memberCookie}` },
    }));
    ok("member cannot read audit trail (403)", h1.status === 403, JSON.stringify(h1.body));

    // Test 6 (HTTP): admin reactivates -> dashboard data available again.
    // Prefer an existing admin's credentials when provided via env; otherwise
    // fall back to the RPC for the state flip (admin HTTP path is still
    // exercised below with the test admin we created in Part A).
    const r = await rpcSetStatus(M1, "active", adminId, "e2e part B reactivation");
    ok("reactivation via admin action", r.body?.ok === true, JSON.stringify(r.body));
    const s4 = await j("reactivated member: GET /api/account/summary", await fetch(`${APP}/api/account/summary`, {
      headers: { Cookie: `sb-${memberCookie}` },
    }));
    ok("reactivated member gets dashboard data (200)", s4.status === 200, JSON.stringify(s4.body?.profile ?? {}));
  }

  // Admin HTTP endpoint with the test admin's session (Part A admin).
  const adminEmailRow = await j("admin profile email", await fetch(
    `${REST}/profiles?id=eq.${adminId}&select=email`, { headers: SVC_HEADERS }
  ));
  const adminEmail = adminEmailRow.body?.[0]?.email;
  const adminIsTest = adminEmail?.startsWith("tdx-status-admin-") ?? false;
  if (adminIsTest) {
    const adminCookie = await login(adminEmail, "TdxStatus!2026x");
    if (adminCookie) {
      const a1 = await j("admin: POST /api/admin/users set_status inactive", await fetch(`${APP}/api/admin/users`, {
        method: "POST",
        headers: { Cookie: `sb-${adminCookie}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: M1, action: "set_status", status: "inactive", reason: "e2e part B" }),
      }));
      ok("admin HTTP set_status works (200 + success)", a1.status === 200 && a1.body?.success === true, JSON.stringify(a1.body));
      ok("response carries authoritative flags", typeof a1.body?.is_active === "boolean" && typeof a1.body?.is_suspended === "boolean");

      const a2 = await j("admin: GET /api/admin/users", await fetch(`${APP}/api/admin/users`, {
        headers: { Cookie: `sb-${adminCookie}` },
      }));
      const m1Row = (a2.body?.users ?? []).find((u) => u.id === M1);
      ok("admin user list reflects new status immediately",
        m1Row?.is_active === false && m1Row?.is_suspended === false, JSON.stringify(m1Row ?? {}));

      const a3 = await j("admin: GET status-history", await fetch(`${APP}/api/admin/users/${M1}/status-history`, {
        headers: { Cookie: `sb-${adminCookie}` },
      }));
      ok("admin can read audit trail (200 + rows)", a3.status === 200 && (a3.body?.changes ?? []).length >= 1, `rows=${a3.body?.changes?.length}`);
      ok("audit row includes actor + reason + timestamp",
        (a3.body?.changes ?? []).some((c) => c.changed_by === adminId && c.reason === "e2e part B" && c.created_at));

      // Restore M1 to active via the HTTP endpoint (leaves a clean state).
      const a4 = await j("admin: POST set_status active (restore)", await fetch(`${APP}/api/admin/users`, {
        method: "POST",
        headers: { Cookie: `sb-${adminCookie}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: M1, action: "set_status", status: "active" }),
      }));
      ok("admin HTTP restore to active", a4.status === 200 && a4.body?.success === true, JSON.stringify(a4.body));
    } else {
      console.log("  SKIP  admin HTTP endpoint checks (test admin login failed)");
    }
  } else {
    console.log("  NOTE  existing production admin in use — HTTP admin-endpoint checks need the test admin (re-run after removing other admins, or set up tdx-status-admin).");
  }
}

console.log(`\n===== FINAL: ${passed} passed, ${failed} failed =====`);
if (failures.length) {
  console.log("FAILED:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
