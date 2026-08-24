/**
 * Post-migration verification for 20260823113000_financial_workflows.sql
 * SAFE: only existence checks and rejection-path tests. No financial rows
 * are created; every RPC call either lacks auth (rejected) or passes a
 * null user (rejected before any write).
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

async function call(label, { key, method = "POST", path, body }) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    console.log(`${label}\n  HTTP ${res.status}: ${text.slice(0, 240)}\n`);
    return { status: res.status, text };
  } catch (e) {
    console.log(`${label}\n  FETCH ERROR: ${e.message}\n`);
    return { status: 0, text: e.message };
  }
}

console.log("=== 1. TABLE EXISTENCE (service role) ===");
await call("investment_upgrades exists", {
  key: SVC,
  method: "GET",
  path: "/rest/v1/investment_upgrades?select=id&limit=1",
});
await call("financial_audit_log exists", {
  key: SVC,
  method: "GET",
  path: "/rest/v1/financial_audit_log?select=id&limit=1",
});
await call("profiles.investment_amount column exists", {
  key: SVC,
  method: "GET",
  path: "/rest/v1/profiles?select=investment_amount&limit=1",
});

console.log("=== 2. UNAUTHENTICATED RPC REJECTION (anon key) ===");
await call("rpc request_withdrawal (anon)", {
  key: ANON,
  path: "/rest/v1/rpc/request_withdrawal",
  body: { p_amount: 1000 },
});
await call("rpc request_return_investment (anon)", {
  key: ANON,
  path: "/rest/v1/rpc/request_return_investment",
  body: {},
});
await call("rpc request_investment_upgrade (anon)", {
  key: ANON,
  path: "/rest/v1/rpc/request_investment_upgrade",
  body: { p_new_amount: 1000 },
});
await call("rpc activate_pending_upgrade (anon)", {
  key: ANON,
  path: "/rest/v1/rpc/activate_pending_upgrade",
  body: { p_user_id: null, p_entity: "withdrawal", p_entity_id: null },
});

console.log("=== 3. SERVICE ROLE CAN REACH activation fn (null user -> rejected, NO writes) ===");
await call("rpc activate_pending_upgrade (service, null user)", {
  key: SVC,
  path: "/rest/v1/rpc/activate_pending_upgrade",
  body: { p_user_id: null, p_entity: "withdrawal", p_entity_id: null },
});

console.log("=== 4. DIRECT INSERT DENIALS (anon key, RLS) ===");
await call("INSERT withdrawals (anon)", {
  key: ANON,
  path: "/rest/v1/withdrawals",
  body: {},
});
await call("INSERT investment_returns (anon)", {
  key: ANON,
  path: "/rest/v1/investment_returns",
  body: {},
});
await call("INSERT investment_upgrades (anon)", {
  key: ANON,
  path: "/rest/v1/investment_upgrades",
  body: {},
});
await call("INSERT financial_audit_log (anon)", {
  key: ANON,
  path: "/rest/v1/financial_audit_log",
  body: {},
});

console.log("=== DONE ===");