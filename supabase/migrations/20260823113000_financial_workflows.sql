-- ============================================================================
-- FINANCIAL WORKFLOWS (forward migration — baseline untouched)
-- Project: jgbbifiizezrwvesdisc
--
-- Implements three member financial workflows with server-authoritative
-- state machines:
--   1. Normal withdrawal      (adds 30-day eligibility + return-hold gate)
--   2. Return Investment      (principal return, 60-day window, hold state)
--   3. Investment Upgrade     (pending change, activates AFTER next
--                              payout/withdrawal event)
--
-- Non-destructive: additive columns/tables/functions/policies only.
-- Two overly-permissive client INSERT policies are DROPPED (see section 5) —
-- this is intentional and required: members must never insert financial
-- records directly; all submissions flow through SECURITY DEFINER RPCs.
-- ============================================================================

-- ============================================================================
-- 1. INVESTMENT RETURNS — extend the existing table
-- ============================================================================
alter table public.investment_returns
  add column if not exists amount               numeric(12,2),
  add column if not exists returned_amount      numeric(12,2),
  add column if not exists approved_by          uuid,
  add column if not exists completed_at         timestamptz,
  add column if not exists completed_by         uuid,
  add column if not exists expected_return_date timestamptz,
  add column if not exists admin_notes          text;

-- Atomic duplicate prevention: at most ONE unresolved (requested/approved)
-- return-investment request per member. Enforced in the database, not the UI.
create unique index if not exists investment_returns_one_unresolved_per_user
  on public.investment_returns (user_id)
  where status in ('requested', 'approved');

create index if not exists idx_investment_returns_user_status
  on public.investment_returns (user_id, status);

-- ============================================================================
-- 2. INVESTMENT UPGRADES — new pending-change table (history preserved)
-- ============================================================================
-- Lifecycle: requested(pending) -> active | rejected | cancelled
-- A pending upgrade NEVER changes the active investment. It becomes active
-- ONLY through activate_pending_upgrade(), invoked by the authoritative
-- next-payout/next-withdrawal-completed event (server-side only).
create table if not exists public.investment_upgrades (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  previous_amount           numeric(12,2) not null,
  requested_amount          numeric(12,2) not null,
  increase_amount           numeric(12,2) not null,
  status                    text not null default 'pending',
  requested_at              timestamptz not null default now(),
  activated_at              timestamptz,
  activated_after_entity    text,           -- 'withdrawal' | 'payout'
  activated_after_entity_id uuid,
  decided_by                uuid,           -- admin who rejected/cancelled
  decided_at                timestamptz,
  decision_note             text,
  constraint investment_upgrades_status_check
    check (status = any(array['pending','active','rejected','cancelled'])),
  constraint investment_upgrades_amounts_positive
    check (previous_amount > 0 and requested_amount > 0 and increase_amount > 0),
  constraint investment_upgrades_increase_matches
    check (increase_amount = requested_amount - previous_amount)
);

create unique index if not exists investment_upgrades_one_pending_per_user
  on public.investment_upgrades (user_id)
  where status = 'pending';

create index if not exists idx_investment_upgrades_user_status
  on public.investment_upgrades (user_id, status);

alter table public.investment_upgrades enable row level security;

create policy "upgrades_select_own_or_admin" on public.investment_upgrades
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No insert/update/delete policies: members can NEVER write this table
-- directly. All writes happen through SECURITY DEFINER RPCs / service role.

-- ============================================================================
-- 3. FINANCIAL AUDIT LOG — append-only trail for every state transition
-- ============================================================================
create table if not exists public.financial_audit_log (
  id             bigint generated always as identity primary key,
  entity         text not null,            -- 'withdrawal'|'return_investment'|'investment_upgrade'
  entity_id      uuid,
  user_id        uuid,                     -- affected member
  actor_id       uuid,                     -- who performed the transition
  previous_status text,
  new_status     text,
  amount         numeric(14,2),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_financial_audit_entity
  on public.financial_audit_log (entity, entity_id);
create index if not exists idx_financial_audit_user
  on public.financial_audit_log (user_id);

alter table public.financial_audit_log enable row level security;

-- Readable by admins only; inserts happen exclusively through SECURITY
-- DEFINER functions / service role (no client write path at all).
create policy "audit_select_admin_only" on public.financial_audit_log
  for select to authenticated
  using (public.is_admin());

-- ============================================================================
-- 3b. AUTHORITATIVE ACTIVE INVESTMENT
-- ============================================================================
-- profiles.investment_amount is the member's CURRENT ACTIVE INVESTMENT
-- (the principal used for profit basis and returned on "Return Investment").
-- It is NULL for legacy members, in which case it is derived from approved
-- deposits (identical to previous behaviour). It is ONLY written by
-- activate_pending_upgrade() (service role) — members have no update grant
-- on this column (profiles column-level grants are explicit).
alter table public.profiles
  add column if not exists investment_amount numeric(12,2);

create or replace function public.active_investment(p_user uuid)
returns numeric(14,2)
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select investment_amount from public.profiles where id = p_user),
    (select coalesce(sum(amount), 0) from public.deposits
      where user_id = p_user and status = 'approved')
  );
$$;

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- True while the member is in the return-investment HOLD state
-- (an approved, not-yet-completed return request exists).
create or replace function public.member_return_hold_active(p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1 from public.investment_returns
     where user_id = p_user and status = 'approved'
  );
$$;

-- Authoritative anchor for the 30-day withdrawal eligibility period.
-- Uses the existing lifecycle: profit_activation_date when present, otherwise
-- the earliest APPROVED deposit (the moment the investment became active).
create or replace function public.withdrawal_eligibility_anchor(p_user uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select profit_activation_date from public.profiles where id = p_user),
    (select min(approved_at) from public.deposits
      where user_id = p_user and status = 'approved'),
    (select min(uploaded_at) from public.deposits
      where user_id = p_user and status = 'approved')
  );
$$;

-- ============================================================================
-- 5. RLS TIGHTENING — remove direct client INSERT paths
-- ============================================================================
-- Members must NOT be able to insert arbitrary withdrawal or return rows
-- (forged amounts / statuses / duplicate spam). Submissions go exclusively
-- through request_withdrawal() / request_return_investment().
drop policy if exists "withdrawals_insert_own" on public.withdrawals;
drop policy if exists "returns_insert_own" on public.investment_returns;

-- ============================================================================
-- 6. WITHDRAWAL RPC — add 30-day eligibility + return-hold gates
-- ============================================================================
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_user_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_fee         constant numeric := 100;
  v_max         constant numeric := 10000000; -- sanity cap per request
  v_available   numeric(14,2);
  v_anchor      timestamptz;
  v_wd          record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if p_amount is null
     or not isfinite(p_amount)
     or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  if p_amount <= v_fee then
    return jsonb_build_object('ok', false, 'reason', 'amount_below_fee');
  end if;

  if p_amount > v_max then
    return jsonb_build_object('ok', false, 'reason', 'amount_too_large');
  end if;

  -- Serialise concurrent financial mutations for this user.
  perform 1 from profiles where id = v_user for update;

  -- GATE 1: return-investment hold (approved return blocks ALL withdrawals).
  if public.member_return_hold_active(v_user) then
    return jsonb_build_object('ok', false, 'reason', 'return_investment_hold');
  end if;

  -- GATE 2: an unresolved return REQUEST also blocks new withdrawals so the
  -- Super Admin never faces two incompatible financial requests at once.
  if exists(select 1 from investment_returns
             where user_id = v_user and status = 'requested') then
    return jsonb_build_object('ok', false, 'reason', 'return_request_pending');
  end if;

  -- GATE 3: 30-day eligibility, anchored to a SERVER-side timestamp.
  v_anchor := public.withdrawal_eligibility_anchor(v_user);
  if v_anchor is null or now() < v_anchor + interval '30 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_eligible_30_days',
      'eligible_at', case when v_anchor is null then null
                          else v_anchor + interval '30 days' end
    );
  end if;

  select coalesce(sum(amount), 0) into v_available
    from deposits
   where user_id = v_user and status = 'approved';

  v_available := v_available
    + coalesce((select sum(amount) from profits
                 where user_id = v_user and status = 'paid'), 0)
    - coalesce((select sum(amount) from withdrawals
                 where user_id = v_user
                   and status in ('pending','approved','completed')), 0)
    - coalesce((select total_deductions from profiles where id = v_user), 0);

  if p_amount > v_available then
    return jsonb_build_object('ok', false,
      'reason', 'insufficient_funds',
      'available', v_available);
  end if;

  insert into withdrawals (user_id, amount, fee, net_amount, status, user_details)
  values (v_user, p_amount, v_fee, p_amount - v_fee, 'pending', p_user_details)
  returning * into v_wd;

  -- Member confirmation notification + bilingual inbox message.
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    v_user,
    'Withdrawal Request Received',
    'درخواست موصول ہو گئی',
    format('Your withdrawal request of %s PKR has been received. Please wait a few hours.', to_char(p_amount, 'FM999999999')),
    format('آپ کی %s روپے کی نکاسی کی درخواست موصول ہو گئی ہے۔ براہِ کرم چند گھنٹے انتظار کریں۔', to_char(p_amount, 'FM999999999')),
    false
  );

  insert into messages (user_id, sender, message, message_ur, is_read)
  values (
    v_user,
    'system',
    'Your withdrawal request has been received. Please wait a few hours.',
    'آپ کی نکاسی کی درخواست موصول ہو گئی ہے۔ براہِ کرم چند گھنٹے انتظار کریں۔',
    false
  );

  -- Super Admin in-app notification(s).
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  select
    p.id,
    'New Withdrawal Request',
    'نئی نکاسی درخواست',
    format('%s (@%s) has requested a withdrawal of %s PKR.',
      coalesce(nullif(p.full_name, ''), p.username), p.username,
      to_char(p_amount, 'FM999999999')),
    format('%s نے %s روپے کی نکاسی کی درخواست دی ہے۔', coalesce(nullif(p.full_name, ''), p.username), to_char(p_amount, 'FM999999999')),
    false
  from profiles p
  where p.role = 'admin';

  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, new_status, amount, note)
  values
    ('withdrawal', v_wd.id, v_user, v_user, 'pending', p_amount,
     'withdrawal requested via request_withdrawal()');

  return jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_wd.id,
    'available_after', v_available - p_amount
  );
end;
$$;

-- NOTE: EXECUTE is granted to PUBLIC by default in PostgreSQL, so it must be
-- revoked from PUBLIC before re-granting to the intended roles.
revoke all on function public.request_withdrawal(numeric, jsonb) from public;
grant execute on function public.request_withdrawal(numeric, jsonb) to authenticated;

-- ============================================================================
-- 7. RETURN INVESTMENT RPC — atomic, server-derived amount
-- ============================================================================
create or replace function public.request_return_investment()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_principal numeric(14,2);
  v_ret       record;
  v_msg_en    constant text :=
    'Your return investment request has been received and sent to the Super Admin for review.';
  v_msg_ur    constant text :=
    'آپ کی سرمایہ کاری واپسی کی درخواست موصول ہو گئی ہے اور سپر ایڈمن کے جائزے کے لیے بھیج دی گئی ہے۔';
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- Serialise concurrent financial mutations for this user.
  perform 1 from profiles where id = v_user for update;

  -- Duplicate prevention (atomic — backed by the partial unique index too).
  if exists(select 1 from investment_returns
             where user_id = v_user and status in ('requested','approved')) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_unresolved_request');
  end if;

  -- Concurrency invariant: no unresolved withdrawal may coexist with a new
  -- return-investment request.
  if exists(select 1 from withdrawals
             where user_id = v_user and status in ('pending','approved')) then
    return jsonb_build_object('ok', false, 'reason', 'unresolved_withdrawal_exists');
  end if;

  -- AUTHORITATIVE principal: the member's current active investment
  -- (profiles.investment_amount when set — e.g. after an activated upgrade —
  -- otherwise the sum of approved deposits). The client is never trusted to
  -- state its own investment amount.
  v_principal := public.active_investment(v_user);

  if v_principal <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_approved_investment');
  end if;

  insert into investment_returns (user_id, status, amount)
  values (v_user, 'requested', v_principal)
  returning * into v_ret;

  -- Member in-app notification.
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    v_user,
    'Return Investment Request Received',
    'درخواست موصول ہو گئی',
    v_msg_en,
    v_msg_ur,
    false
  );

  -- Member bilingual inbox message.
  insert into messages (user_id, sender, message, message_ur, is_read)
  values (v_user, 'system', v_msg_en, v_msg_ur, false);

  -- Super Admin in-app notification(s).
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  select
    p.id,
    'New Return Investment Request',
    'نئی سرمایہ کاری واپسی درخواست',
    format('%s (@%s) has requested return of their original investment of %s PKR (request %s).',
      coalesce(nullif(p.full_name, ''), p.username), p.username,
      to_char(v_principal, 'FM999999999'), v_ret.id),
    format('%s نے اپنی اصل سرمایہ کاری (%s روپے) واپسی کی درخواست دی ہے۔',
      coalesce(nullif(p.full_name, ''), p.username), to_char(v_principal, 'FM999999999')),
    false
  from profiles p
  where p.role = 'admin';

  -- Audit trail.
  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, new_status, amount, note)
  values
    ('return_investment', v_ret.id, v_user, v_user, 'requested', v_principal,
     'return investment request submitted');

  return jsonb_build_object(
    'ok', true,
    'request_id', v_ret.id,
    'amount', v_principal,
    'requested_at', v_ret.requested_at
  );
end;
$$;

revoke all on function public.request_return_investment() from public;
grant execute on function public.request_return_investment() to authenticated;

-- ============================================================================
-- 8. INVESTMENT UPGRADE RPC — pending change, validated server-side
-- ============================================================================
create or replace function public.request_investment_upgrade(p_new_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_current  numeric(14,2);
  v_up       record;
  v_msg_en   constant text :=
    'Your investment upgrade request has been received. Your new investment amount will be counted after your next payout/withdrawal.';
  v_msg_ur   constant text :=
    'آپ کی سرمایہ کاری میں اضافے کی درخواست موصول ہو گئی ہے۔ آپ کی نئی سرمایہ کاری کی رقم آپ کی اگلی پیمنٹ/نکاسی کے بعد شمار ہوگی۔';
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if p_new_amount is null
     or not isfinite(p_new_amount)
     or p_new_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- Serialise concurrent financial mutations for this user.
  perform 1 from profiles where id = v_user for update;

  -- Once the member is in the return-investment hold, no upgrades accepted.
  if public.member_return_hold_active(v_user) then
    return jsonb_build_object('ok', false, 'reason', 'return_investment_hold');
  end if;

  -- One pending upgrade at a time.
  if exists(select 1 from investment_upgrades
             where user_id = v_user and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_pending_upgrade');
  end if;

  -- AUTHORITATIVE current active investment (upgrade-aware).
  v_current := public.active_investment(v_user);

  if v_current <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_active_investment');
  end if;

  -- An upgrade must strictly increase the investment (server-side check).
  if p_new_amount <= v_current then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_upgrade',
      'current_amount', v_current
    );
  end if;

  insert into investment_upgrades
    (user_id, previous_amount, requested_amount, increase_amount, status)
  values
    (v_user, v_current, p_new_amount, p_new_amount - v_current, 'pending')
  returning * into v_up;

  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    v_user,
    'Investment Upgrade Request Received',
    'درخواست موصول ہو گئی',
    v_msg_en,
    v_msg_ur,
    false
  );

  insert into messages (user_id, sender, message, message_ur, is_read)
  values (v_user, 'system', v_msg_en, v_msg_ur, false);

  -- Super Admin in-app notification(s).
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  select
    p.id,
    'New Investment Upgrade Request',
    'نئی سرمایہ کاری اضافہ درخواست',
    format('%s (@%s) requested an investment upgrade: %s PKR -> %s PKR (increase %s PKR).',
      coalesce(nullif(p.full_name, ''), p.username), p.username,
      to_char(v_current, 'FM999999999'),
      to_char(p_new_amount, 'FM999999999'),
      to_char(p_new_amount - v_current, 'FM999999999')),
    format('%s نے سرمایہ کاری میں اضافے کی درخواست دی ہے: %s روپے سے %s روپے۔',
      coalesce(nullif(p.full_name, ''), p.username),
      to_char(v_current, 'FM999999999'),
      to_char(p_new_amount, 'FM999999999')),
    false
  from profiles p
  where p.role = 'admin';

  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, new_status, amount, note)
  values
    ('investment_upgrade', v_up.id, v_user, v_user, 'pending', p_new_amount,
     format('upgrade requested: %s -> %s', v_current, p_new_amount));

  return jsonb_build_object(
    'ok', true,
    'upgrade_id', v_up.id,
    'previous_amount', v_current,
    'requested_amount', p_new_amount,
    'increase_amount', p_new_amount - v_current
  );
end;
$$;

revoke all on function public.request_investment_upgrade(numeric) from public;
grant execute on function public.request_investment_upgrade(numeric) to authenticated;

-- ============================================================================
-- 9. UPGRADE ACTIVATION — triggered ONLY by the authoritative
--    next-payout / next-withdrawal-completed event (service role callers).
-- ============================================================================
create or replace function public.activate_pending_upgrade(
  p_user_id   uuid,
  p_entity    text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_up  record;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_user');
  end if;
  if p_entity is null or p_entity not in ('withdrawal','payout') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_entity');
  end if;

  select * into v_up
    from investment_upgrades
   where user_id = p_user_id and status = 'pending'
   order by requested_at
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'activated', false);
  end if;

  update investment_upgrades
     set status                   = 'active',
         activated_at             = now(),
         activated_after_entity   = p_entity,
         activated_after_entity_id = p_entity_id
   where id = v_up.id and status = 'pending';

  if not found then
    return jsonb_build_object('ok', true, 'activated', false);
  end if;

  -- Promote the pending amount to the member's authoritative active
  -- investment. This affects FUTURE profit basis / display only — it does
  -- NOT add withdrawable funds (solvency still uses actual deposits,
  -- paid profits, withdrawals, deductions).
  update profiles
     set investment_amount = v_up.requested_amount
   where id = p_user_id;

  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    p_user_id,
    'Investment Upgrade Active',
    'سرمایہ کاری اپڈیٹ فعال',
    format('Your investment upgrade is now active. Your investment amount is now %s PKR.', to_char(v_up.requested_amount, 'FM999999999')),
    format('آپ کا سرمایہ کاری اضافہ اب فعال ہے۔ آپ کی سرمایہ کاری کی رقم اب %s روپے ہے۔', to_char(v_up.requested_amount, 'FM999999999')),
    false
  );

  insert into messages (user_id, sender, message, message_ur, is_read)
  values (
    p_user_id,
    'system',
    format('Your investment upgrade is now active. Previous investment: %s PKR. New investment: %s PKR. It became effective after your %s.',
      to_char(v_up.previous_amount, 'FM999999999'),
      to_char(v_up.requested_amount, 'FM999999999'),
      p_entity),
    format('آپ کا سرمایہ کاری اضافہ اب فعال ہے۔ پرانی رقم: %s روپے۔ نئی رقم: %s روپے۔ یہ آپ کی %s کے بعد لاگو ہوا۔',
      to_char(v_up.previous_amount, 'FM999999999'),
      to_char(v_up.requested_amount, 'FM999999999'),
      case p_entity when 'withdrawal' then 'نکاسی (withdrawal)' else 'پیمنٹ (payout)' end),
    false
  );

  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, previous_status, new_status, amount, note)
  values
    ('investment_upgrade', v_up.id, p_user_id, null, 'pending', 'active',
     v_up.requested_amount,
     format('activated after %s %s; active investment set to %s',
       p_entity, coalesce(p_entity_id::text, ''),
       to_char(v_up.requested_amount, 'FM999999999')));

  return jsonb_build_object('ok', true, 'activated', true, 'upgrade_id', v_up.id);
end;
$$;

-- Executable ONLY by the service role (admin API routes). Revoke from PUBLIC
-- (the PostgreSQL default), anon, and authenticated.
revoke all on function public.activate_pending_upgrade(uuid, text, uuid) from public;

-- ============================================================================
-- 10. GRANTS — least privilege on new tables
-- ============================================================================
revoke all on public.investment_upgrades from public;
grant select on public.investment_upgrades to authenticated;

revoke all on public.financial_audit_log from public;
-- Admin reads flow through RLS-scoped selects with the authenticated role:
grant select on public.financial_audit_log to authenticated;

-- ============================================================================
-- 11. ADDENDUM (applied in production post-verification)
-- ============================================================================
-- Supabase default privileges explicitly grant EXECUTE on functions to
-- anon/authenticated/service_role, so revoking from PUBLIC alone does NOT
-- remove those grants. Post-migration smoke testing proved anon could reach
-- activate_pending_upgrade(). Strip anon+authenticated explicitly; only the
-- service role retains access.
revoke all on function public.activate_pending_upgrade(uuid, text, uuid) from anon;
revoke all on function public.activate_pending_upgrade(uuid, text, uuid) from authenticated;

-- Hygiene: member RPCs already reject unauthenticated callers via auth.uid(),
-- but strip anon's EXECUTE as well so privilege state matches intent exactly.
revoke all on function public.request_withdrawal(numeric, jsonb) from anon;
revoke all on function public.request_return_investment() from anon;
revoke all on function public.request_investment_upgrade(numeric) from anon;
