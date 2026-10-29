-- Add missing application columns/tables with RLS. Preserve all existing financial values and payment-account settings.

create table if not exists public.payment_agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.payment_agents enable row level security;
drop policy if exists "payment_agents_select_all" on public.payment_agents;
create policy "payment_agents_select_all" on public.payment_agents
  for select to authenticated using (true);
insert into public.payment_agents (name, is_active)
values ('Shakeela', true)
on conflict (name) do nothing;
alter table public.deposits
  alter column receipt_image_url drop not null;
alter table public.deposits
  add column if not exists payment_method text not null default 'online_transfer';
alter table public.deposits
  add column if not exists cash_agent_id uuid references public.payment_agents(id),
  add column if not exists cash_agent_name text,
  add column if not exists cash_payment_date date;
alter table public.deposits
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposits_payment_method_check'
      and conrelid = 'public.deposits'::regclass
  ) then
    alter table public.deposits
      add constraint deposits_payment_method_check
      check (payment_method in ('online_transfer', 'cash_agent'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposits_cash_fields_check'
      and conrelid = 'public.deposits'::regclass
  ) then
    alter table public.deposits
      add constraint deposits_cash_fields_check
      check (
        (payment_method = 'cash_agent' and cash_agent_name is not null and cash_payment_date is not null)
        or
        (payment_method = 'online_transfer' and receipt_image_url is not null and receipt_image_url <> '')
        or
        (payment_method not in ('cash_agent', 'online_transfer'))
      );
  end if;
end $$;
create index if not exists idx_deposits_payment_method on public.deposits (payment_method);
create index if not exists idx_deposits_cash_agent_id on public.deposits (cash_agent_id);
create index if not exists idx_deposits_user_status on public.deposits (user_id, status);
drop policy if exists "deposits_insert_own" on public.deposits;
create policy "deposits_insert_own" on public.deposits
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and payment_method in ('online_transfer', 'cash_agent')
  );
alter table public.deposits
  add column if not exists next_payout_date timestamptz;
alter table public.deposits
  add column if not exists monthly_profit_pct numeric(5,2);
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
create index if not exists idx_deposits_next_payout_date
  on public.deposits (next_payout_date)
  where status = 'approved' and next_payout_date is not null;
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
create unique index if not exists payouts_unique_deposit_month_year
  on public.payouts (deposit_id, month, year) where status = 'paid';
create index if not exists idx_payouts_user_status on public.payouts (user_id, status);
create index if not exists idx_payouts_deposit on public.payouts (deposit_id);
create index if not exists idx_payouts_created on public.payouts (created_at);
alter table public.payouts enable row level security;
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
create unique index if not exists uq_prd_profit_stage_channel
  on public.payout_reminder_deliveries (profit_id, stage, channel)
  where profit_id is not null;
create unique index if not exists uq_prd_deposit_stage_channel
  on public.payout_reminder_deliveries (deposit_id, stage, channel)
  where deposit_id is not null;
create index if not exists idx_prd_profit on public.payout_reminder_deliveries (profit_id) where profit_id is not null;
create index if not exists idx_prd_deposit on public.payout_reminder_deliveries (deposit_id) where deposit_id is not null;
create index if not exists idx_prd_user on public.payout_reminder_deliveries (user_id);
create index if not exists idx_prd_stage_channel on public.payout_reminder_deliveries (stage, channel);
create index if not exists idx_prd_created on public.payout_reminder_deliveries (created_at);
create index if not exists idx_prd_payout_date on public.payout_reminder_deliveries (payout_date);
alter table public.payout_reminder_deliveries enable row level security;
grant all on public.payment_agents, public.payouts, public.payout_reminder_deliveries to service_role;
grant select on public.payment_agents, public.payouts, public.payout_reminder_deliveries to authenticated;
revoke insert, update, delete on public.payment_agents, public.payouts, public.payout_reminder_deliveries from anon, authenticated;
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
create index if not exists idx_profits_payout_date_pending
  on public.profits (payout_date)
  where status = 'pending' and payout_date is not null;
