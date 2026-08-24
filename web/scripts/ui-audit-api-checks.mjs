/**
 * READ-ONLY UI/INTEGRATION AUDIT — live API rejection tests.
 * All calls are UNAUTHENTICATED; every endpoint must reject before any
 * write. No financial records are created.
 */
const BASE = "http://localhost:3000";
const NL = String.fromCharCode(10);

async function call(label, method, path, body) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const text = await res.text();
    const flat = text.slice(0, 160).split(NL).join(" ");
    console.log(`${label} | HTTP ${res.status}: ${flat}`);
  } catch (e) {
    console.log(`${label} | ERROR: ${e.message}`);
  }
}

console.log("=== MEMBER ENDPOINTS (expect 401) ===");
await call("GET  /api/account/summary", "GET", "/api/account/summary");
await call("POST /api/withdraw", "POST", "/api/withdraw", { amount: 1000 });
await call("POST /api/returns/request", "POST", "/api/returns/request");
await call("POST /api/upgrades/request", "POST", "/api/upgrades/request", {
  newAmount: 1000,
});

console.log("=== ADMIN ENDPOINTS (expect 403) ===");
await call("GET  /api/admin/returns", "GET", "/api/admin/returns");
await call("POST /api/admin/returns (approve)", "POST", "/api/admin/returns", {
  returnId: "00000000-0000-0000-0000-000000000000",
  action: "approve",
});
await call(
  "POST /api/admin/returns (mark_completed)",
  "POST",
  "/api/admin/returns",
  { returnId: "00000000-0000-0000-0000-000000000000", action: "mark_completed" }
);
await call("POST /api/admin/upgrades (reject)", "POST", "/api/admin/upgrades", {
  upgradeId: "00000000-0000-0000-0000-000000000000",
  action: "reject",
});
await call(
  "POST /api/admin/withdrawals (complete)",
  "POST",
  "/api/admin/withdrawals",
  { withdrawalId: "00000000-0000-0000-0000-000000000000", action: "complete" }
);
await call("POST /api/admin/payouts (payout)", "POST", "/api/admin/payouts", {
  profitId: "00000000-0000-0000-0000-000000000000",
  action: "payout",
});

console.log("=== PAGES RENDER ===");
for (const p of ["/", "/login", "/register", "/dashboard", "/admin"]) {
  try {
    const res = await fetch(BASE + p, { redirect: "manual" });
    console.log(
      `${p} -> HTTP ${res.status} (${res.headers.get("location") ?? "-"})`
    );
  } catch (e) {
    console.log(`${p} -> ERROR ${e.message}`);
  }
}
console.log("=== DONE ===");