-- ============================================================================
-- P0 SECURITY HARDENING (forward migration — baseline untouched)
-- Project: jgbbifiizezrwvesdisc
--
-- 1. Referral integrity: unique referred_user_id + atomic claim_referral RPC
-- 2. Withdrawal solvency: atomic request_withdrawal RPC (row-locked balance)
-- 3. RLS rebuild: drop all existing public policies, recreate minimal
--    owner-scoped sets; privileged profile columns protected via column grants
-- 4. Storage: enforce MIME types + size limits on app buckets
--
-- Non-destructive: no tables dropped, no columns altered, no data touched.
-- ============================================================================

-- ============================================================================
-- 1. REFERRALS
-- ============================================================================
-- One referral reward per referred user (table currently empty in prod).
alter table public.referrals
  add constraint referrals_referred_user_id_key unique (referred_user_id);

-- Atomic, replay-safe referral claim.
-- Called by the AUTHENTICATED user (auth.uid() = the referred user).
-- The referrer is resolved server-side from the referral code — the client
-- can never supply a referrer id. Self-referral and duplicates are rejected.
create or replace function public.claim_referral(p_ref_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_referrer uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if p_ref_code is null or length(btrim(p_ref_code)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select id into v_referrer
    from profiles
   where referral_code = btrim(p_ref_code)
   limit 1;

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  if v_referrer = v_user then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  insert into referrals (referrer_id, referred_user_id, bonus_amount, status)
  values (v_referrer, v_user, 100, 'pending')
  on conflict (referred_user_id) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;

  update profiles
     set referral_bonus = referral_bonus + 100
   where id = v_referrer;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.claim_referral(text) from anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ============================================================================
-- 2. WITHDRAWALS — atomic solvency-checked request
-- ============================================================================
-- Balance model (authoritative, server-side only):
--   available = approved deposits
--             + PAID profits
--             - withdrawals in ('pending','approved','completed')  [reserved or spent]
--             - total_deductions
-- The profile row lock serialises concurrent requests per user so two
-- parallel submissions cannot overspend the same balance.
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
  v_user      uuid := auth.uid();
  v_fee       constant numeric := 100;
  v_max       constant numeric := 10000000; -- sanity cap per request
  v_available numeric(14,2);
  v_wd        record;
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
    -- net amount would be zero/negative after the fixed fee
    return jsonb_build_object('ok', false, 'reason', 'amount_below_fee');
  end if;

  if p_amount > v_max then
    return jsonb_build_object('ok', false, 'reason', 'amount_too_large');
  end if;

  -- Serialise concurrent financial mutations for this user.
  perform 1 from profiles where id = v_user for update;

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

  return jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_wd.id,
    'available_after', v_available - p_amount
  );
end;
$$;

revoke all on function public.request_withdrawal(numeric, jsonb) from anon;
grant execute on function public.request_withdrawal(numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- investment_returns: the live CHECK constraint does not allow 'rejected',
-- which makes the existing admin "reject" action fail with a DB error.
-- Widen it (additive — no data change).
-- ---------------------------------------------------------------------------
alter table public.investment_returns drop constraint investment_returns_status_check;
alter table public.investment_returns add constraint investment_returns_status_check
  check (status = any(array['requested','approved','completed','rejected']));

-- ============================================================================
-- 3. RLS REBUILD
-- ============================================================================
-- Drop every existing policy on public tables (they were captured in the
-- baseline; several are unsafe or duplicated). Recreate a minimal, explicit set.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Users see/edit ONLY their own row. Admin read access uses the trusted
-- is_admin() helper (evaluates the CALLER's role, never the row's).
-- Privileged columns are protected by column-level grants below, so even the
-- owner cannot change role / is_active / is_suspended / package_id /
-- profit_activation_date / referral_bonus / selfie verification fields.
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column-level write protection:
revoke update on public.profiles from anon, authenticated;
grant update (
  username, full_name, address, city, mobile_number,
  account_number, payment_method, profile_picture_url,
  selfie_url, referral_code
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- deposits — users may create and read their own; no client updates/deletes
-- ---------------------------------------------------------------------------
create policy "deposits_select_own_or_admin" on public.deposits
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "deposits_insert_own" on public.deposits
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- profits — READ-ONLY for users (prevents self-marking payouts as paid)
-- ---------------------------------------------------------------------------
create policy "profits_select_own_or_admin" on public.profits
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- withdrawals — users may request (insert) and read their own; no updates
-- ---------------------------------------------------------------------------
create policy "withdrawals_select_own_or_admin" on public.withdrawals
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "withdrawals_insert_own" on public.withdrawals
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- messages — users may send (sender='user' enforced) and read their own
-- ---------------------------------------------------------------------------
create policy "messages_select_own_or_admin" on public.messages
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "messages_insert_own_user" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid() and sender = 'user');

-- ---------------------------------------------------------------------------
-- notifications — read own + global broadcasts; users may only mark is_read
-- ---------------------------------------------------------------------------
create policy "notifications_select_own_or_global" on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or user_id is null or public.is_admin());

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only the is_read flag may be modified by users:
revoke update on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- tasks — owner-scoped CRUD minus delete
-- ---------------------------------------------------------------------------
create policy "tasks_select_own_or_admin" on public.tasks
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "tasks_insert_own" on public.tasks
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- investment_returns — request + read own; no client updates/deletes
-- ---------------------------------------------------------------------------
create policy "returns_select_own_or_admin" on public.investment_returns
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "returns_insert_own" on public.investment_returns
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- referrals — read-only for involved parties; inserts happen exclusively
-- through claim_referral() (SECURITY DEFINER bypasses RLS)
-- ---------------------------------------------------------------------------
create policy "referrals_select_involved_or_admin" on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid()
      or referred_user_id = auth.uid()
      or public.is_admin());

-- ---------------------------------------------------------------------------
-- push_subscriptions — full owner-scoped management
-- ---------------------------------------------------------------------------
create policy "push_subs_all_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- packages — public catalog, no client writes
-- ---------------------------------------------------------------------------
create policy "packages_public_read" on public.packages
  for select to public
  using (true);

-- ---------------------------------------------------------------------------
-- announcements — public read; admin mutations flow through service-role APIs
-- ---------------------------------------------------------------------------
create policy "announcements_public_read" on public.announcements
  for select to public
  using (true);

-- ============================================================================
-- 4. STORAGE — enforce upload type/size limits at the storage layer
-- ============================================================================
update storage.buckets
   set file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id in ('receipts','selfies','task-screenshots');

update storage.buckets
   set file_size_limit = 2097152, -- 2 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'profile-pictures';