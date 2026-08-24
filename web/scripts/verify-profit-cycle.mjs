import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

async function main() {
  // 1. New columns exist on withdrawals (PostgREST errors if a column is missing).
  const { error: wdErr } = await supabase
    .from("withdrawals")
    .select(
      "id,amount,fee,net_amount,status,user_details,requested_at,processed_at,monthly_profit_rate,cycle_number,cycle_start,cycle_end"
    )
    .limit(1);
  check("withdrawals new columns exist", !wdErr, wdErr?.message ?? "");

  // 2. New column exists on profiles.
  const { error: profErr } = await supabase
    .from("profiles")
    .select("id,investment_amount")
    .limit(1);
  check("profiles.investment_amount exists", !profErr, profErr?.message ?? "");

  // 3. request_withdrawal RPC exists + rejection path (no authenticated user
  //    => auth.uid() is null => no approved investment => rejected).
  const { data: rw, error: rwErr } = await supabase.rpc("request_withdrawal");
  const rwOk = !rwErr && rw && typeof rw === "object" && rw.ok === false;
  check(
    "request_withdrawal rejects with no user (ok:false)",
    rwOk,
    rwErr?.message ?? JSON.stringify(rw)
  );

  // 4. complete_profit_withdrawal RPC exists + rejects a bogus withdrawal id.
  const { data: cw, error: cwErr } = await supabase.rpc(
    "complete_profit_withdrawal",
    {
      p_withdrawal_id: "00000000-0000-0000-0000-000000000000",
      p_rate: 8,
      p_actor: "00000000-0000-0000-0000-000000000000",
    }
  );
  const cwOk = !cwErr && cw && typeof cw === "object" && cw.ok === false;
  check(
    "complete_profit_withdrawal rejects bogus withdrawal (ok:false)",
    cwOk,
    cwErr?.message ?? JSON.stringify(cw)
  );

  // 5. withdrawal_current_cycle(p_user) RPC exists (empty set for unknown user).
  const { error: cycErr } = await supabase.rpc("withdrawal_current_cycle", {
    p_user: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "withdrawal_current_cycle(p_user) RPC callable",
    !cycErr,
    cycErr?.message ?? ""
  );

  // 6. active_investment(p_user) RPC exists (0 for unknown user).
  const { data: ai, error: aiErr } = await supabase.rpc("active_investment", {
    p_user: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "active_investment(p_user) RPC callable (returns 0)",
    !aiErr && Number(ai) === 0,
    aiErr?.message ?? JSON.stringify(ai)
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Script error:", e);
  process.exit(1);
});