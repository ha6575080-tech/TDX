-- ============================================================================
-- DUAL DEPOSIT METHODS — ONLINE TRANSFER + CASH TO AGENT
-- Requirement 7: two official deposit methods for every registered member
--   - ONLINE TRANSFER: Jazz Cash / Shakeela / 0308-3958294 + receipt
--   - CASH TO AGENT: Shakeela (extensible) + payment date, no receipt
--
-- Also satisfies:
--   - No duplicate approvals (idempotent approval already enforced, retained)
--   - Receipt only required for online; cash has auditable record
--   - Server-side NEXT DAY cycle calculation
--   - Agent architecture extensible without redesign
--   - Forward-only, non-destructive, no production reset
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. PAYMENT AGENTS — authoritative configuration (active agents only visible
--    to members; admin sees which agent received cash)
-- --------------------------------------------------------------------------
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

-- No insert/update/delete policies for members — only service role / admin
-- via service-role client may modify agents (enforced by absence of client
-- write policies). Members can only SELECT.

-- Seed the initial authorized cash agent: Shakeela (idempotent)
insert into public.payment_agents (name, is_active)
values ('Shakeela', true)
on conflict (name) do update set is_active = true;

-- --------------------------------------------------------------------------
-- 2. DEPOSITS — add dual-method columns
-- --------------------------------------------------------------------------
-- Make receipt_image_url nullable (cash deposits have no online receipt).
-- This is safe: existing rows all have values, new online rows will provide
-- one, cash rows may be null.
alter table public.deposits
  alter column receipt_image_url drop not null;

-- Payment method: distinguishes online_transfer vs cash_agent
alter table public.deposits
  add column if not exists payment_method text not null default 'online_transfer';

-- For cash deposits: historical snapshot + optional FK
alter table public.deposits
  add column if not exists cash_agent_id uuid references public.payment_agents(id),
  add column if not exists cash_agent_name text,
  add column if not exists cash_payment_date date;

-- Audit fields for admin review (preserve approval timestamp + reviewer)
alter table public.deposits
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id);

-- Update existing rows that have no payment_method value (should already
-- default, but ensure historical consistency for rows inserted before default):
update public.deposits
  set payment_method = 'online_transfer'
  where payment_method is null;

-- Backfill historical rows that may have empty receipt placeholder:
-- keep as-is; online rows historically used receipt paths.

-- --------------------------------------------------------------------------
-- 3. CONSTRAINTS — enforce valid payment_method and cash field coherence
-- --------------------------------------------------------------------------
-- Valid methods
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

-- Cash deposits must have agent name + payment date; online must have receipt
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

-- Note: existing data with payment_method='online_transfer' but empty
-- receipt_image_url placeholder 'pending-upload' (from agent onboarding) is
-- considered valid for this check because it is non-empty. New cash deposits
-- must supply agent+date; new online deposits must supply a storage path.

-- Drop default for payment_method so callers must be explicit going forward
-- (keeps historical rows but forces new inserts to declare method clearly).
-- We keep the default for backward-compat during transition, so NOT dropping.
-- If you want strict explicitness, uncomment:
-- alter table public.deposits alter column payment_method drop default;

create index if not exists idx_deposits_payment_method on public.deposits (payment_method);
create index if not exists idx_deposits_cash_agent_id on public.deposits (cash_agent_id);
create index if not exists idx_deposits_user_status on public.deposits (user_id, status);

-- --------------------------------------------------------------------------
-- 4. RLS — tighten insert to enforce payment_method validity
-- --------------------------------------------------------------------------
drop policy if exists "deposits_insert_own" on public.deposits;

create policy "deposits_insert_own" on public.deposits
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and payment_method in ('online_transfer', 'cash_agent')
  );

-- No update/delete policies for members — already enforced (members cannot
-- mutate deposits after insertion). Admins mutate via service role (bypasses RLS).

-- --------------------------------------------------------------------------
-- 5. VERIFICATION
-- --------------------------------------------------------------------------
-- Online insert (requires receipt):
--   insert into deposits (user_id, amount, receipt_image_url, status, payment_method)
--   values (auth.uid(), 50000, 'uid/file.jpg', 'pending', 'online_transfer');
--
-- Cash insert (requires agent+date, receipt may be null):
--   insert into deposits (user_id, amount, status, payment_method, cash_agent_name, cash_payment_date)
--   values (auth.uid(), 50000, 'pending', 'cash_agent', 'Shakeela', '2026-09-05');
--
-- Invalid (rejected by CHECK):
--   - online without receipt -> fails deposits_cash_fields_check
--   - cash without agent/date -> fails deposits_cash_fields_check
--   - payment_method='approved' -> fails deposits_payment_method_check / insert policy

-- --------------------------------------------------------------------------
-- 6. PACKAGES — align legacy defaults with new official account
--    (packages are historical; new product uses free amount, but ensure no
--    obsolete default remains for any future package creation)
-- --------------------------------------------------------------------------
alter table public.packages alter column account_name set default 'Shakeela';
alter table public.packages alter column account_number set default '0308-3958294';
-- Update existing package rows that still carry the old Saim/EasyPaisa defaults (non-destructive, preserves custom rows)
update public.packages
  set account_name = 'Shakeela', account_number = '0308-3958294'
  where account_name in ('Saim', 'Saima', 'Saima Easy Paisa Account')
    or account_number in ('0325-2879424');

