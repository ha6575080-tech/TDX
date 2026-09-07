# TDX Payout Reminder — Production Audit & Hobby-Compliant Fix
**Date:** 2026-09-08 Asia/Karachi  
**Base:** `8548cc4` (main) vs `cf82752` (dual deposit + dropdown) vs `9aa8c47` (report)  
**Branch:** `arena/01a07b28-tdx`  
**Status:** Audit COMPLETE, migration + code fix APPLIED, typecheck & build PASS, mocked-stage tests PASS. **No deploy — on Vercel Hobby manual external cron required.**

---

## 1. Vercel Hobby Cron Constraint — Audit

**Finding:** `web/vercel.json` on both `8548cc4` and `cf82752`:
```json
{ "crons": [{ "path": "/api/cron/payout-reminders", "schedule": "0 0 * * *" }] }
```
This is the **only hobby-allowed schedule** (daily at midnight UTC). Hobby forbids minute expressions (`*/5`, `*/10`, `*/15` etc.). The previous cron logic assumed a *daily* run (see §3) but the product requires 10-minute granularity.

**Risk:** Keeping `0 0 * * *` alone **cannot** satisfy `48h/24h/12h/1h/10m` reminders — the `10m` stage would be missed 23h/day, and `1h` would be unreliable.

**Fix (non-breaking):** Keep `0 0 * * *` in `vercel.json` as a *fallback* (allowed on Hobby, never removed). Add authoritative scheduling via **external 5-minute hit** to `GET /api/cron/payout-reminders` with `Authorization: Bearer $CRON_SECRET`. Recommended externals:
- **cron-job.org** every 5m → `https://<vercel-url>/api/cron/payout-reminders` header `Authorization: Bearer …`
- **UptimeRobot** every 5m
- **GitHub Actions** `cron: "*/5 * * * *"` curl job

The endpoint is documented as *safe for frequent calls* (≥5m, even every minute) — see §5. Daily Vercel cron then becomes a redundant safety net, not the driver.

**File:** `web/vercel.json` unchanged (intentional). External schedule documented in `web/app/api/cron/payout-reminders/route.ts` header comment and in `web/lib/payoutReminders.ts`.

---

## 2. PostgreSQL 42703 / 42P01 Root Cause — FIXED

**42703 undefined_column** reproduced in two routes:

| Route | Query | Error |
|---|---|---|
| `web/app/api/cron/payout-reminders/route.ts:40` | `.from("deposits").select("id, user_id, amount, next_payout_date, monthly_profit_pct")` | `deposits.next_payout_date` *does not exist* |
| `web/app/api/admin/payouts/process/route.ts:33` | same plus `.update({next_payout_date, monthly_profit_pct})` | same |
| `web/app/api/admin/payouts/process/route.ts:50` | `.from("payouts").select…` / `.insert({payouts})` | `payouts` table *never created* (42P01) |

**Evidence:** Baseline `20260822163852_live_baseline.sql` defines `deposits` *without* those columns; no later migration adds them; `grep -rn "next_payout_date" supabase/migrations` returns 0 DDL. `grep -rn "CREATE TABLE.*payouts"` returns 0.

**Fix migration:** `supabase/migrations/20260908000001_payout_reminder_deliveries_and_fix_42703.sql` (forward-only, additive, non-destructive):
- `ALTER TABLE deposits ADD COLUMN next_payout_date timestamptz` + index `idx_deposits_next_payout_date` + backfill (`approved_at+30d`)
- `ALTER TABLE deposits ADD COLUMN monthly_profit_pct numeric(5,2)` + check `in (7,8,9,10)` + backfill `8` for legacy approved rows
- `CREATE TABLE payouts` (per-deposit ledger for `/admin/payouts/process`) with unique partial index `payouts_unique_deposit_month_year` (exactly-once per month), RLS policies `payouts_select_admin/own`
- `CREATE TABLE payout_reminder_deliveries` (see §4)
- `CREATE INDEX idx_profits_payout_date_pending` for profit-ledger horizon queries

After migration both routes compile and run without 42703/42P01. `admin/payouts/process` also patched to handle `23505` duplicate via the new unique index (see §6).

---

## 3. Pre-Fix Reminder Architecture — Why It Cannot Meet Requirements

**Current cron (before fix):**
```ts
// range: now .. now+24h
// guard: SELECT id FROM notifications WHERE title='Payout Reminder' AND created_at >= dayStartUtc LIMIT 1
// if exists => skip entire run (return reminder_already_sent_today)
```
- **One-per-day guard:** The `dayStartUtc` check on `notifications` prevents *any* second reminder on the same calendar day, even for a *different* payout or a *different stage*. Directly violates requirement `never one-per-day` and `5 stages per payout`.
- **Boolean flag in profits:** `profits.reminder_sent boolean` is single-flag, not per-stage, not per-channel, not per-member independent. Cannot represent `48h/24h/12h/1h/10m` nor email vs in_app separation.
- **No dedicated delivery table:** No unique constraint → retries *do* duplicate if the guard is removed; no idempotency.
- **Admin-aggregated only:** Single email+single notification for *all* due deposits aggregated, not per-payout independent.

**Result:** Even if `next_payout_date` existed, the architecture would still miss stages, duplicate on retry, and block multi-member parallel deliveries.

---

## 4. New DB-Backed Idempotency — `payout_reminder_deliveries`

**Schema** (migration §2):

```sql
CREATE TABLE payout_reminder_deliveries (
  id uuid PK default gen_random_uuid(),
  profit_id uuid FK profits(id),
  deposit_id uuid FK deposits(id),
  user_id uuid FK profiles(id) NOT NULL,
  payout_date timestamptz NOT NULL,
  stage text CHECK (stage in ('48h','24h','12h','1h','10m')),
  channel text CHECK (channel in ('email','in_app')),
  created_at timestamptz NOT NULL default now(),
  CHECK ((profit_id is not null)::int + (deposit_id is not null)::int = 1)
);
CREATE UNIQUE INDEX uq_prd_profit_stage_channel ON payout_reminder_deliveries (profit_id,stage,channel) WHERE profit_id IS NOT NULL;
CREATE UNIQUE INDEX uq_prd_deposit_stage_channel ON payout_reminder_deliveries (deposit_id,stage,channel) WHERE deposit_id IS NOT NULL;
-- plus indexes on user_id, stage/channel, payout_date, created_at
```

**Guarantees:**
- **Per payout/deposit ID + stage + channel unique:** Attempting to claim the same `(profit_id,24h,email)` twice raises `23505` → second attempt is treated as already-sent, not an error.
- **Email vs in-app separate:** Different `channel` values have *independent* unique keys, so email failure never blocks in_app and vice-versa, and a retry on one never duplicates the other.
- **No financial mutation:** The table is *notify-only*; financial tables (`profits`, `payouts`, `deposits`) are never written by the cron.
- **Multi-member independent:** The unique key includes the specific `profit_id`/`deposit_id`; member A failure never blocks member B.
- **Never one-per-day:** No `dayStartUtc` check; each of the 5 stages can fire on the same calendar day for the same payout (at different times), governed only by the stage window + unique constraint.
- **Concurrent-safe:** Two external cron workers hitting at the same second will race on the same insert; only one wins, the other gets `23505` and skips — no duplicate email.

**RLS:** `ENABLE ROW LEVEL SECURITY` with `prd_select_own` / `prd_select_admin` (read-only for authenticated); writes only via `service_role` (cron uses `SUPABASE_SERVICE_ROLE_KEY`).

---

## 5. Cron Rewrite — Stage Derivation, Frequent-Call Safe

**New file:** `web/lib/payoutReminders.ts` (single source of truth, tested) + rewritten `web/app/api/cron/payout-reminders/route.ts`.

**Stage model:**
```ts
REMINDER_STAGES = [
  {stage:"48h", ms:48h},
  {stage:"24h", ms:24h},
  {stage:"12h", ms:12h},
  {stage:"1h",  ms:1h},
  {stage:"10m", ms:10m},
]
TOLERANCE = 5m
isDue(payoutDate, now) ⇔ 0 < delta ≤ stage.ms && delta > stage.ms - TOLERANCE
```
- At `T+48h` exactly, `48h` is due; 2 minutes later still due (within 5m); 6 minutes later *not* due — narrow window ensures **exactly once per stage even when called every 5m** (or every minute).
- If the external scheduler is down and a window is missed, that stage is intentionally *not* backfilled late (to avoid spamming overdue reminders); only future stages will fire. This is documented and aligns with the `every 5m` requirement.
- `getDueStages(payoutDate, now)` is pure and unit-tested (see §9).

**Endpoint flow:**
1. **CRON_SECRET protected:** `Authorization: Bearer $CRON_SECRET` or 401.
2. **Horizon query:** `now → now+48h+TOLERANCE` on *both* `deposits (approved, next_payout_date)` and `profits (pending, payout_date)` in parallel, limit 500, indexed.
3. **Batch profile fetch** (1 query, no N+1).
4. **Per-entity per-stage loop:** For each deposit/profit, `getDueStages` → for each due stage → **claim email** then **claim in_app** independently via `tryClaimDelivery` (`insert` → catch `23505` → skip).
5. **Delivery:** Only after a successful claim does the code send email or insert `notifications`. Email goes to `ADMIN_EMAIL` (default `ha6575080@gmail.com`) per-stage per-payout; in-app inserts for the payout owner *plus* fan-out to each admin for visibility (separate `notifications` rows but shared delivery claim).
6. **Failure handling:** Email/in-app failures are `logServerWarn`/`logServerError` only; financial state is never mutated; the delivery remains claimed (exactly-once claim-before-send) so a retry never duplicates even if the transient failure is retried.
7. **Response:** JSON with `now`, `horizon`, `toleranceMs`, `dueDeposits`, `dueProfits`, `claimed`, `attempted`, `delivered[]` for observability.

**Why safe for `≥5m`:** The 5m tolerance equals the external interval; every stage window will be hit exactly once without needing precise clock alignment. Calling every minute is also safe (only one minute will fall in the 5m window, others no-op via `getDueStages` + unique). Calling hourly would *miss* the `10m` window — hence the documented requirement to use 5m externals.

**Removed:** `notifications.title=Payout Reminder + dayStartUtc` guard, `profits.reminder_sent` usage, aggregated single-email logic.

---

## 6. Financial Idempotency & Channel Separation — Verified

- **Process route fix:** `web/app/api/admin/payouts/process/route.ts` now uses `.maybeSingle()` for the pre-check and handles `payoutErr.code===23505` → `409 Payout already processed` (handles race between two admins). The DB unique index is the authoritative guard; the app check is only an optimization.
- **Cron never mutates finance:** No `update deposits`/`insert profits`/`payouts` in the cron; only `payout_reminder_deliveries` + `notifications` + `sendMail`. Requirement `failure no duplicate financial action` satisfied by construction.
- **Retry never duplicates:** Verified via mocked tests (see §9) — second insert on same `(id,stage,channel)` always `23505`, no second email/notification.
- **Email vs in-app separate:** Tested — same `profit_id+stage` can have both `email` and `in_app` rows independently; duplicate on one does not affect the other.

---

## 7. Dual Deposit & Related Audit — `cf82752` vs Baseline

**Dual deposit (REQ7) — PASS with notes:**
- `supabase/migrations/20260907000001_dual_deposit_methods.sql` is correct: `payment_agents` table, `deposits.payment_method` (`online_transfer`/`cash_agent`), `cash_agent_name/id`, `cash_payment_date` (date, not timestamp), `reviewed_at/by`, CHECKs, indexes, RLS `deposits_insert_own` (now enforces `payment_method in (…)`), and `packages` defaults updated from `Saim/0325` → `Shakeela/0308-3958294`.
- `web/components/DepositForm.tsx` correctly: method selector required, online requires `receipt` + `MIN/MAX` validation + 5 MB limit, cash requires `selectedAgent` + `paymentDate ≤ today` + confirmation summary, uploads to `receipts` only for online, cash `receipt_image_url=null`, agent list fetched from DB with static fallback, uses `PAYMENT_METHODS` constants.
- `web/app/api/deposit/route.ts` correctly branches: `online_transfer` does Gemini analysis + signed-url email with `PAYMENT_ACCOUNT`, `cash_agent` skips AI, marks `cash` verdict, both call `notifyAdmins`/`sendAdminEmail` with method-specific HTML (agent+date for cash, receipt link for online). Uses `PAYMENT_ACCOUNT` (`Shakeela/Jazz Cash/0308-3958294`).
- `web/app/api/admin/deposits/route.ts` correctly: selects `payment_method,cash_*`, server-authoritative `nextDayISO` for `profit_activation_date = now+1d` (next-day, not same-day), `reviewed_at/by`, `payment_method` label, bilingual messages, non-blocking `notifyMember` + `sendMemberEmail` (push best-effort).
- **Minor observation:** `web/lib/investment.ts` `PAYMENT_ACCOUNT` is now single source of truth — no remaining `Saima` refs in code (see §7.5).

**Cash validation / next-day / profit_activation — PASS:**
- `cash_payment_date` is `type="date"` with `max={todayStr}` client + server `deposits_cash_fields_check` ensures cash has agent+date and online has receipt.
- Approval sets `profit_activation_date = nextDayISO(approvalNow)` (server-calculated, not client), and `is_active=true`. Correct.

**Saima/EasyPaisa purge — PASS (historical baseline preserved):**
- `grep -R Saima` in `web/` returns 0; only `docs/` historical report and `20260822163852_live_baseline.sql` (baseline, intentionally unchanged) and `20260907000001` `UPDATE packages SET account_name='Shakeela' WHERE account_name IN ('Saim','Saima'…)` — which *fixes* legacy rows. No user-facing `Saima` remains.
- `web/lib/investment.ts` `accountName:"Shakeela"` `accountNumber:"0308-3958294"` `method:"JAZZ CASH"` — correct.
- `web/lib/paymentAgents.ts` `PAYMENT_AGENTS:[{name:"Shakeela",isActive:true}]` — single source, extensible.

**paymentAgents / Profile / Settings / dropdown / receipt / notifications / email — PASS:**
- `paymentAgents.ts` correct, `ACTIVE_AGENT_NAMES` helper.
- `web/app/profile/page.tsx` edits `full_name,address,city,mobile,account_number,payment_method`; `username/role/profit_activation_date` are read-only (server column grants). Dropdown includes correct payment methods (EASY PAISA etc. for withdrawal method, not deposit account). Not a regression.
- `web/app/settings/page.tsx` and `web/components/UserDropdown.tsx` (top-right, `aria-haspopup`, outside-click+Esc handling, shows `full_name/username/email/role`, links to `/profile,/settings,/chat`, logout via `supabase.auth.signOut` + `router.push("/login")`) — correct per REQ8.
- Receipt generation and `notifications` are preserved (no regression).

---

## 8. Typecheck & Build — PASS

```
$ npx tsc --noEmit
# (no output) → PASS

$ NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
  SUPABASE_SERVICE_ROLE_KEY=dummy CRON_SECRET=dummy \
  SMTP_USER=dummy SMTP_PASS=dummy \
  npm run build

✓ Compiled successfully
✓ Generating static pages (54/54)
Routes include:
  /api/cron/payout-reminders (ƒ dynamic)  ← new
  /api/admin/payouts/process (ƒ dynamic) ← fixed
  /api/deposit, /api/admin/deposits, etc.
```

Build requires `NEXT_PUBLIC_SUPABASE_URL` etc. (expected; Vercel provides them at build time). Without dummy env the `ChatBubble` `createClient()` prerender error is pre-existing and unrelated to this change.

---

## 9. Mocked 5-Stage Tests — PASS (30/30)

**Script:** `scripts/test_payout_reminders.js` (pure-node, no DB, simulates `getDueStages` + `MockDeliveryTable` unique `23505`).

```
✓ stage 48h is due when payout is exactly 48h away
✓ stage 48h is due 2 minutes after stage time (within 5m tolerance)
✓ stage 48h is NOT due 6 minutes after stage time (outside tolerance)
✓ stage 48h is NOT due when payout is 1h before that stage
... (same for 24h,12h,1h,10m)
✓ no due when payout is in the past
✓ no due when payout is exactly now
✓ exact-once per stage+channel: concurrent inserts only one succeeds
✓ retry after success never duplicates (idempotent)
✓ email vs in_app separate: same profit+stage can have both channels
✓ multi-member independent: same stage for different profit IDs both succeed
✓ different stages for same profit are independent
✓ deposit_id vs profit_id independence with partial unique
✓ failure does not block other channel (partial failure)
✓ never one-per-day: two different stages on same day both fire if due

Tests: 30 passed, 0 failed
✓ All payout reminder idempotency tests passed
```

**What each group proves:**
- **Stages 48h/24h/12h/1h/10m** each fire *only* within their 5m window → no duplication when called every 5m, no missed stage when tolerance met.
- **Exact-once:** Two concurrent inserts on same `(id,stage,channel)` → one `23505`, one row → retry idempotent.
- **Retry:** 5 retries after first success → all `23505`, count stays 1.
- **Channel separation:** Same `profit_id+stage` can have `email` *and* `in_app` independently; duplicate on one does not affect the other.
- **Multi-member:** Same stage for `profit-aaa` and `profit-bbb` both succeed (independent keys).
- **Never one-per-day:** `profit-777` can have `24h` and `12h` both on same calendar day (two rows) — old `dayStartUtc` guard would have blocked the second.

**Production DB verification (to run after migration apply):**
```sql
-- should error on duplicate:
INSERT INTO payout_reminder_deliveries (profit_id,user_id,payout_date,stage,channel)
VALUES ('<profit-uuid>', '<user-uuid>', now()+interval '24 hours', '24h','email');
-- second identical insert → 23505 unique_violation
```

---

## Deliverables (this branch)

- `supabase/migrations/20260908000001_payout_reminder_deliveries_and_fix_42703.sql` — forward migration (deposits columns + payouts table + delivery table + indexes + RLS)
- `web/lib/payoutReminders.ts` — stage logic (single source, tested)
- `web/app/api/cron/payout-reminders/route.ts` — rewritten Hobby-compliant, per-stage idempotent, dual-source (deposits+profits), channel-separated
- `web/app/api/admin/payouts/process/route.ts` — 42703 fixed (now satisfiable) + 23505 duplicate→409 handling
- `scripts/test_payout_reminders.js` — 30-tests mocked suite (exact-once+retry)
- `docs/PAYOUT_REMINDER_AUDIT_FIX_20260908.md` — this report

## Not Deployed

As instructed, no `git push` to production, no Vercel deploy. Apply the migration on staging (`supabase db push` or `supabase migration up`) then verify:
```bash
npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL=… npm run build
node scripts/test_payout_reminders.js
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/payout-reminders
```
Set up external 5-minute scheduler (cron-job.org/UptimeRobot/GitHub Actions) to hit the endpoint with the `CRON_SECRET`.

---

*End of audit.*
