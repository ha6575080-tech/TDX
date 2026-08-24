/**
 * E2E TEST SETUP — creates the DEDICATED test member and its pending deposit.
 * Uses Supabase auth admin API (service role) ONLY for account creation
 * (equivalent to registering through /register); all subsequent member
 * actions run under the MEMBER's own session token through real RLS-scoped
 * paths. No financial records beyond the planned pending deposit.
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

const EMAIL = "tdx-test-01@tdx.example.com";
const PASSWORD = "TdxTest!2026x";
const META = {
  username: "tdx_test_01",
  full_name: "TDX Test Member 01",
  address: "Test Street 1",
  city: "Lahore",
  mobile_number: "03001234567",
  account_number: "0325-2879424",
  payment_method: "EASYPAISA",
};

async function j(label, res) {
  const text = await res.text();
  console.log(`${label} | HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 1. Create (or fetch) the confirmed test user via auth admin API.
let created = await j("create user", await fetch(`${BASE}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: META,
  }),
}));

let userId = created?.id ?? created?.user?.id ?? null;

if (!userId && created?.msg?.includes("already")) {
  // Already exists: look it up by email.
  const q = await j("lookup user", await fetch(
    `${BASE}/auth/v1/admin/users?page=1&per_page=50`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } }
  ));
  userId = q?.users?.find((u) => u.email === EMAIL)?.id ?? null;
}

if (!userId) {
  console.error("FAILED to obtain test user id");
  process.exit(1);
}
console.log(`TEST_USER_ID=${userId}`);

// 2. Sign in as the member (anon client path) to get a member session.
const login = await j("member login", await fetch(
  `${BASE}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }
));
const memberToken = login?.access_token;
if (!memberToken) {
  console.error("FAILED member login");
  process.exit(1);
}

// 3. Verify the profile row exists (created by handle_new_user trigger).
const prof = await j("profile check", await fetch(
  `${BASE}/rest/v1/profiles?id=eq.${userId}&select=id,username,mobile_number,is_active`,
  { headers: { apikey: ANON, Authorization: `Bearer ${memberToken}` } }
));
console.log("PROFILE:", JSON.stringify(prof));

// 4. Insert the pending deposit (PKR 500,000) as the member.
const dep = await j("insert deposit", await fetch(`${BASE}/rest/v1/deposits`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${memberToken}`, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({
    amount: 500000,
    receipt_image_url: "https://example.com/tdx-test-receipt.png",
  }),
}));
const depositId = Array.isArray(dep) ? dep[0]?.id : dep?.id ?? null;
console.log(`DEPOSIT_ID=${depositId ?? "(check manually)"}`);
console.log("SETUP DONE — awaiting admin approval of this deposit.");