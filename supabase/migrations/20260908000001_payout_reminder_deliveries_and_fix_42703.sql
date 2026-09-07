-- ============================================================================
-- PAYOUT REMINDER DELIVERIES + FIX 42703 (deposits.next_payout_date etc)
-- Fixes:
--   PostgreSQL 42703 undefined_column on web/app/api/cron/payout-reminders and
--   web/app/api/admin/payouts/process which query deposits.next_payout_date,
--   deposits.monthly_profit_pct and the payouts table that never existed.
--   Adds the missing columns/table forward-only (no destructive changes).
--
-- Reminder architecture for Vercel Hobby:
--   Hobby forbids minute crons (*/5 etc). vercel.json keeps the allowed
--   daily 0 0 * * * as a fallback, but the authoritative schedule is an
--   external 5-minute hit to GET /api/cron/payout-reminders with
--   Authorization: Bearer CRON_SECRET. The endpoint is idempotent, derives
--   which of the 5 stages (48h,24h,12h,1h,10m) is currently due per payout,
--   and uses a DB-backed delivery table with a unique constraint per
--   (payout/deposit ID, stage, channel) so retries never duplicate —
--   even under concurrent executions and even when email vs in-app are
--   delivered independently.
--   Each member payout is independent; one member failure never blocks another.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. DEPOSITS — add missing payout-scheduling columns (42703 fix)
-- --------------------------------------------------------------------------
alter table public.deposits
  add column if not exists next_payout_date timestamptz;

alter table public.deposits
  add column if not exists monthly_profit_pct numeric(5,2);

-- Validate percentages when present (7,8,9,10 only) — matches
-- web/app/api/admin/payouts/process validation and lib/investment.ts
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposits_monthly_profit_pct_check'
      and conrelid = 'public.deposits'::regclass
  ) then
    alter table public.deposits
      add constraint deposits_monthly_profit_pct_check
      check (monthly_profit_pct is null or monthly_profit_pct in (7,8,9,10));
  end if;
end $$;

-- Index for the cron range query: approved deposits with a future payout date
create index if not exists idx_deposits_next_payout_date
  on public.deposits (next_payout_date)
  where status = 'approved' and next_payout_date is not null;

-- Backfill: for already-approved deposits that have approved_at but no
-- next_payout_date, set a deterministic 30-day horizon. This keeps existing
-- data consistent without overwriting any manually-set future dates.
update public.deposits
   set next_payout_date = approved_at + interval '30 days'
 where status = 'approved'
   and next_payout_date is null
   and approved_at is not null;

-- If monthly_profit_pct is null on approved deposits, default to 8%
-- (the historical 8% rate used by the cron fallback). Only backfills
-- legacy rows; new rows are written explicitly by the payout process.
update public.deposits
   set monthly_profit_pct = 8
 where monthly_profit_pct is null
   and status = 'approved';

-- --------------------------------------------------------------------------
-- 2. PAYOUTS — legacy per-deposit payout ledger referenced by
--    web/app/api/admin/payouts/process (42P01 fix). Additive only.
--    Kept separate from profits (per-user-month ledger) so the old
--    per-deposit flow remains satisfiable without touching financial logic.
-- --------------------------------------------------------------------------
create table if not exists public.payouts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  deposit_id         uuid not null references public.deposits(id) on delete cascade,
  amount             numeric(12,2) not null check (amount > 0),
  percentage_applied integer not null check (percentage_applied in (7,8,9,10)),
  month              integer not null check (month between 1 and 12),
  year               integer not null check (year >= 2020 and year <= 2100),
  status             text not null default 'paid' check (status in ('paid','pending')),
  created_at         timestamptz not null default now()
);

-- One paid payout per deposit per calendar month (idempotency at DB level)
create unique index if not exists payouts_unique_deposit_month_year
  on public.payouts (deposit_id, month, year) where status = 'paid';

create index if not exists idx_payouts_user_status on public.payouts (user_id, status);
create index if not exists idx_payouts_deposit on public.payouts (deposit_id);
create index if not exists idx_payouts_created on public.payouts (created_at);

alter table public.payouts enable row level security;

-- No client-side write policies: only service_role / admin via service role
-- may insert payouts (enforced by absence of INSERT policies for authenticated).
-- Admins may read via the profiles.is_admin() helper.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'payouts_select_admin' and tablename = 'payouts') then
    create policy "payouts_select_admin" on public.payouts
      for select to authenticated
      using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'payouts_select_own' and tablename = 'payouts') then
    create policy "payouts_select_own" on public.payouts
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3. PAYOUT REMINDER DELIVERIES — idempotency for 48h/24h/12h/1h/10m
-- --------------------------------------------------------------------------
-- One row per (payout entity, stage, channel). Email and in-app are
-- tracked separately so a failure in one channel never blocks the other and
-- never causes a duplicate financial action (cron never mutates financial
-- state — it only notifies). The unique indexes are the authoritative
-- idempotency guarantee; the API uses insert ... on conflict do nothing
-- (or catching 23505) to achieve exact-once per stage under retries and
-- concurrent executions. Multi-member independence follows because the
-- unique key includes the specific payout id (profit_id or deposit_id).
create table if not exists public.payout_reminder_deliveries (
  id          uuid primary key default gen_random_uuid(),
  profit_id   uuid references public.profits(id) on delete cascade,
  deposit_id  uuid references public.deposits(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  payout_date timestamptz not null,
  stage       text not null check (stage in ('48h','24h','12h','1h','10m')),
  channel     text not null check (channel in ('email','in_app')),
  created_at  timestamptz not null default now(),
  constraint payout_reminder_deliveries_target_check
    check ((profit_id is not null)::int + (deposit_id is not null)::int = 1)
);

-- Partial unique indexes — the true idempotency enforcement.
-- Postgres treats NULL as distinct, so we need two partial indexes
-- (a single unique(profit_id,deposit_id,stage,channel) would not prevent
-- duplicates where one side is NULL).
create unique index if not exists uq_prd_profit_stage_channel
  on public.payout_reminder_deliveries (profit_id, stage, channel)
  where profit_id is not null;

create unique index if not exists uq_prd_deposit_stage_channel
  on public.payout_reminder_deliveries (deposit_id, stage, channel)
  where deposit_id is not null;

-- Convenience indexes for queries and cleanup
create index if not exists idx_prd_profit on public.payout_reminder_deliveries (profit_id) where profit_id is not null;
create index if not exists idx_prd_deposit on public.payout_reminder_deliveries (deposit_id) where deposit_id is not null;
create index if not exists idx_prd_user on public.payout_reminder_deliveries (user_id);
create index if not exists idx_prd_stage_channel on public.payout_reminder_deliveries (stage, channel);
create index if not exists idx_prd_created on public.payout_reminder_deliveries (created_at);
-- Query optimization: find deliveries for a payout quickly
create index if not exists idx_prd_payout_date on public.payout_reminder_deliveries (payout_date);

alter table public.payout_reminder_deliveries enable row level security;

-- Only service_role may write deliveries (cron uses service role).
-- Authenticated may read their own deliveries for observability.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'prd_select_own' and tablename = 'payout_reminder_deliveries') then
    create policy "prd_select_own" on public.payout_reminder_deliveries
      for select to authenticated
      using (user_id = auth.uid() or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'prd_select_admin' and tablename = 'payout_reminder_deliveries') then
    create policy "prd_select_admin" on public.payout_reminder_deliveries
      for select to authenticated
      using (public.is_admin());
  end if;
end $$;

comment on table public.payout_reminder_deliveries is 'Idempotent delivery ledger for payout reminders. One row per (profit_id|deposit_id, stage, channel). Unique partial indexes guarantee exact-once per stage even under concurrent cron retries. Channels are tracked separately (email vs in_app) so a failure in one never duplicates the other and never triggers a financial mutation.';
comment on column public.payout_reminder_deliveries.stage is 'Reminder horizon: 48h,24h,12h,1h,10m before payout_date';
comment on column public.payout_reminder_deliveries.channel is 'Delivery channel: email or in_app — tracked separately for idempotency';
comment on column public.deposits.next_payout_date is 'Next scheduled monthly profit payout for this deposit. Maintained by admin payout process (now+30d). Used by cron/payout-reminders.';
comment on column public.deposits.monthly_profit_pct is 'Monthly profit rate applied to this deposit (7,8,9,10). Maintained by admin payout process.';
comment on table public.payouts is 'Legacy per-deposit payout ledger for admin/payouts/process. Separate from profits (per-user-month). Both satisfy 42703/42P01 for that endpoint.';

-- --------------------------------------------------------------------------
-- 4. PROFITS — optimize reminder range query
-- --------------------------------------------------------------------------
create index if not exists idx_profits_payout_date_pending
  on public.profits (payout_date)
  where status = 'pending' and payout_date is not null;
