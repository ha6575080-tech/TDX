-- Forward repair for the live access-control drift found on 2026-10-29.
-- No balances, historical transactions, dates, rates, or payment accounts change.
-- Prerequisites: dual_deposit_methods and payout_reminder_deliveries migrations.

grant select on public.payment_agents to authenticated, service_role;

-- Policies are permissive by default: an old ALL policy overrides newer checks.
drop policy if exists "Users manage own deposits" on public.deposits;
drop policy if exists "deposits insert own" on public.deposits;
drop policy if exists "Users manage own profits" on public.profits;
drop policy if exists "Users manage own withdrawals" on public.withdrawals;
drop policy if exists "withdrawals insert own" on public.withdrawals;
drop policy if exists "Users manage own returns" on public.investment_returns;
drop policy if exists "returns insert own" on public.investment_returns;

-- Financial transitions are performed by server-side service-role handlers or
-- guarded RPCs. Members retain their existing owner-scoped read policies.
revoke insert, update, delete on public.profits, public.withdrawals,
  public.investment_returns, public.investment_upgrades, public.financial_audit_log
  from anon, authenticated;
revoke insert, update, delete on public.deposits from anon, authenticated;
grant insert (user_id, package_id, amount, receipt_image_url, status,
  payment_method, cash_agent_name, cash_agent_id, cash_payment_date)
  on public.deposits to authenticated;

drop policy if exists "deposits_insert_own" on public.deposits;
create policy "deposits_insert_own" on public.deposits for insert to authenticated
with check (
  user_id = (select auth.uid()) and status = 'pending'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.is_suspended)
  and (
    (payment_method = 'online_transfer'
      and split_part(receipt_image_url, '/', 1) = (select auth.uid())::text
      and array_length(string_to_array(receipt_image_url, '/'), 1) = 2
      and split_part(receipt_image_url, '/', 2) not in ('', '.', '..')
      and receipt_image_url !~ '[\\\\%]')
    or (payment_method = 'cash_agent' and cash_payment_date <= (now() at time zone 'Asia/Karachi')::date
      and exists (select 1 from public.payment_agents a where a.id = cash_agent_id and a.name = cash_agent_name and a.is_active))
  )
);

-- Task evidence and penalties are server-controlled; direct edits could erase
-- deductions or forge completed evidence. The API already owns these writes.
revoke insert, update, delete on public.tasks from anon, authenticated;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;

-- Notifications must only be created by trusted server code. Members may mark
-- their own notifications read, but cannot rewrite their content or recipient.
drop policy if exists "System inserts notifications" on public.notifications;
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;
revoke select on public.notifications from anon;

-- A member must never impersonate an admin/system/AI sender using the Data API.
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages for insert to authenticated
with check (user_id = (select auth.uid()) and sender = 'user'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.is_suspended));

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.request_return_investment() from public, anon;
grant execute on function public.request_return_investment() to authenticated, service_role;

-- The existing API-only suspension gate can be bypassed by calling an RPC
-- directly. Guard after the shared profile row lock to serialize suspension.
do $migration$
declare
  signature text;
  definition text;
  lock_statement constant text := 'perform 1 from profiles where id = v_user for update;';
  guard_sql constant text := $guard$
  perform 1 from profiles where id = v_user for update;
  if not exists (select 1 from public.profiles where id = v_user and not is_suspended) then
    return jsonb_build_object('ok', false, 'reason', 'account_suspended');
  end if;
  $guard$;
begin
  foreach signature in array array['public.request_withdrawal()', 'public.request_return_investment()', 'public.request_investment_upgrade(numeric)'] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('account_suspended' in definition) = 0 then
      if position(lock_statement in definition) = 0 then
        raise exception 'Unexpected function definition: %', signature;
      end if;
      execute replace(definition, lock_statement, guard_sql);
    end if;
  end loop;

  -- profits.id is UUID in the live database; bigint fails on an existing row.
  definition := pg_get_functiondef('public.complete_profit_withdrawal(uuid,numeric,uuid)'::regprocedure);
  if definition ~ 'v_ledger_id[[:space:]]+bigint;' then
    execute regexp_replace(definition, 'v_ledger_id[[:space:]]+bigint;', 'v_ledger_id public.profits.id%TYPE;');
  end if;
end;
$migration$;

-- Privileged payment and account-control functions are internal only.
revoke execute on function public.complete_profit_withdrawal(uuid,numeric,uuid),
  public.activate_pending_upgrade(uuid,text,uuid), public.set_member_status(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.complete_profit_withdrawal(uuid,numeric,uuid),
  public.activate_pending_upgrade(uuid,text,uuid), public.set_member_status(uuid,text,uuid,text)
  to service_role;
