import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;

// 1. Admin account metadata (no passwords).
const r = await fetch(`${BASE}/rest/v1/profiles?role=eq.admin&select=id,username,email,full_name,is_active,is_suspended,role`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
console.log("ADMIN ACCOUNTS | HTTP", r.status);
console.log(await r.text());

// 2. Is /api/account/summary healthy on the local dev server?
for (const path of ["/api/account/summary", "/api/tasks/ensure"]) {
  const res = await fetch("http://localhost:3000" + path, {
    method: path.startsWith("/api/tasks") ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: path.startsWith("/api/tasks") ? "{}" : undefined,
  });
  console.log(`LOCAL ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
}