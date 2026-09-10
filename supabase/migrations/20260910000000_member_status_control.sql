-- ============================================================================
-- SUPER ADMIN MEMBER STATUS CONTROL (forward migration — baseline untouched)
--
-- Member account status is COMPLETELY INDEPENDENT from deposit/receipt state:
--   * A member can be suspended/activated/deactivated at ANY time — right
--     after registration, with zero deposits, no receipt uploaded, a pending
--     deposit, or no deposit history at all. This primitive has NO financial
--     preconditions (no receipt, no approval, no amount, no payment method).
--   * Deposit approval no longer clears a manual suspension (enforced in the
--     app layer: /api/admin/deposits approve no longer writes is_suspended).
--
-- Reuses the EXISTING status fields — no duplicate status system:
--   Suspended = is_suspended = true                    (is_active preserved)
--   Active    = is_active = true  AND is_suspended = false
--   Inactive  = is_active = false AND is_suspended = false
--
-- 1. member_status_changes — immutable audit trail (admin-only by RLS default
--    deny + revoked client grants; members can never read it)
-- 2. set_member_status()   — atomic, DB-authorization-checked status change
--    (update + audit row in one transaction; service role only)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT TRAIL
--    One immutable row per status transition:
--      member_id, previous_status, new_status, changed_by, reason, created_at
--    Membership: RLS enabled with NO permissive policies (deny-by-default) and
--    all client grants revoked, so anon/authenticated can never select,
--    insert, update or delete these rows. Writes happen ONLY inside the
--    SECURITY DEFINER set_member_status() function below, which is only
--    executable by the service role (see revokes at the bottom).
-- ----------------------------------------------------------------------------
create table if not exists public.member_status_changes (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null,
  previous_status text not null,
  new_status      text not null,
  changed_by      uuid not null,
  reason          text,
  created_at      timestamptz not null default now(),
  constraint member_status_changes_member_fkey
    foreign key (member_id) references public.profiles (id) on delete no action,
  constraint member_status_changes_changed_by_fkey
    foreign key (changed_by) references auth.users (id) on delete no action,
  constraint member_status_changes_previous_chk
    check (previous_status in ('active', 'inactive', 'suspended')),
  constraint member_status_changes_new_chk
    check (new_status in ('active', 'inactive', 'suspended'))
);

create index if not exists member_status_changes_member_idx
  on public.member_status_changes (member_id, created_at desc);
create index if not exists member_status_changes_changed_by_idx
  on public.member_status_changes (changed_by, created_at desc);

comment on table public.member_status_changes is
  'Audit trail of admin member-status changes (admin-only; never exposed to members)';

alter table public.member_status_changes enable row level security;
-- No policies are created: every client role is denied by default.
revoke all on public.member_status_changes from public;
revoke all on public.member_status_changes from anon;
revoke all on public.member_status_changes from authenticated;

-- ----------------------------------------------------------------------------
-- 2. ATOMIC STATUS TRANSITION (service role only)
--    Contract:
--      * p_status must be one of 'active' | 'inactive' | 'suspended'.
--      * Works for ANY member regardless of deposits, receipts, payment
--        method or amount — a freshly registered member with zero deposits
--        is suspendable immediately.
--      * Re-verifies p_changed_by has role='admin' (DB-side defense in
--        depth; the HTTP layer already enforces requireAdmin() for the
--        caller's own row — the function never trusts client input).
--      * Suspended: flips is_suspended=true ONLY. is_active and every
--        financial/history record are preserved untouched, so the admin can
--        reactivate and the member's prior state is restored.
--      * Active:     is_active=true,  is_suspended=false
--      * Inactive:   is_active=false, is_suspended=false
--      * No-op (and no audit row) when the target equals the current status.
--      * Profile update + audit insert run in ONE transaction — the status
--        can never change without its audit row (or vice versa).
--    Returns jsonb:
--      ok=true  {ok, changed, status, previous_status}
--      ok=false {ok, reason: 'invalid_args' | 'invalid_status' | 'forbidden'
--               | 'member_not_found'}
-- ----------------------------------------------------------------------------
create or replace function public.set_member_status(
  p_member_id  uuid,
  p_status     text,
  p_changed_by uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_active    boolean;
  v_is_suspended boolean;
  v_prev         text;
begin
  if p_member_id is null or p_changed_by is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_args');
  end if;

  if p_status not in ('active', 'inactive', 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  -- DB-side authorization: ONLY an admin (role constrained by
  -- profiles_role_check) may change member status. Never trusts the caller
  -- context beyond the supplied user id, which the API sets to the
  -- authenticated admin's own id.
  if not exists (
    select 1 from profiles
     where id = p_changed_by
       and role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- Row lock serialises concurrent transitions for the same member.
  select is_active, is_suspended
    into v_is_active, v_is_suspended
    from profiles
   where id = p_member_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'member_not_found');
  end if;

  v_prev := case
             when v_is_suspended then 'suspended'
             when v_is_active    then 'active'
             else 'inactive'
           end;

  -- Same status: nothing to do, no audit noise.
  if v_prev = p_status then
    return jsonb_build_object('ok', true, 'changed', false,
                              'status', p_status, 'previous_status', v_prev);
  end if;

  if p_status = 'suspended' then
    -- Suspend: flip ONLY the suspension flag. is_active (financial
    -- activation history) and all deposits/profits/withdrawals/receipts are
    -- preserved unchanged.
    update profiles
       set is_suspended = true,
           updated_at   = now()
     where id = p_member_id;
  else
    update profiles
       set is_suspended = false,
           is_active    = (p_status = 'active'),
           updated_at   = now()
     where id = p_member_id;
  end if;

  -- Audit row — same transaction, so it can never be missing.
  insert into public.member_status_changes
    (member_id, previous_status, new_status, changed_by, reason)
  values
    (p_member_id, v_prev, p_status, p_changed_by, nullif(btrim(p_reason), ''));

  return jsonb_build_object('ok', true, 'changed', true,
                            'status', p_status, 'previous_status', v_prev);
end;
$$;

-- Only the service role may execute this. Client roles (incl. authenticated
-- members and agents) get NO execute — a member can never change their own
-- status even with a direct RPC call.
revoke execute on function public.set_member_status(uuid, text, uuid, text)
  from public;
revoke execute on function public.set_member_status(uuid, text, uuid, text)
  from anon;
revoke execute on function public.set_member_status(uuid, text, uuid, text)
  from authenticated;

-- Supabase service role (supabase_admin) retains EXECUTE by default; the
-- Next.js admin API (/api/admin/users) is the only caller and enforces
-- requireAdmin() before invoking it.
