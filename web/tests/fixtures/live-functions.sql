CREATE OR REPLACE FUNCTION public.activate_pending_upgrade(p_user_id uuid, p_entity text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.active_investment(p_user uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select investment_amount from public.profiles where id = p_user),
    (select coalesce(sum(amount), 0) from public.deposits
      where user_id = p_user and status = 'approved')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.complete_profit_withdrawal(p_withdrawal_id uuid, p_rate numeric, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wd         record;
  v_actor_role text;
  v_principal  numeric(14,2);
  v_profit     numeric(14,2);
  v_fee        constant numeric := 100;
  v_net        numeric(14,2);
  v_pmonth     integer;
  v_pyear      integer;
  v_ledger_id  bigint;
begin
  -- Actor must exist AND be an admin (server-side verification).
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;
  select role into v_actor_role from profiles where id = p_actor;
  if v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  -- Rate whitelist (DB CHECK also guards the column).
  if p_rate is null or p_rate not in (7.0, 8.0, 9.0, 10.0) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rate');
  end if;

  select * into v_wd from withdrawals where id = p_withdrawal_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_wd.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  -- AUTHORITATIVE principal for THIS member's CURRENT investment.
  v_principal := public.active_investment(v_wd.user_id);
  if v_principal <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_approved_investment');
  end if;

  -- Server-side profit calculation: principal × rate ÷ 100, PKR 100 fee.
  v_profit := round(v_principal * p_rate / 100.0, 2);
  v_net    := v_profit - v_fee;
  if v_net <= 0 then
    return jsonb_build_object(
      'ok', false, 'reason', 'profit_below_fee',
      'profit', v_profit, 'fee', v_fee
    );
  end if;

  -- Idempotent completion (conditional update is the guard).
  update withdrawals
     set status             = 'completed',
         processed_at       = now(),
         amount             = v_profit,
         fee                = v_fee,
         net_amount         = v_net,
         monthly_profit_rate = p_rate
   where id = v_wd.id
     and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  -- Profits ledger (single accounting mechanism). Attribute the profit to
  -- the calendar month/year in which the cycle ended. If a legacy PENDING
  -- row already exists for that month/year, promote it to paid; otherwise
  -- insert a paid row. The same cycle can never be paid twice because the
  -- withdrawal itself is unique per cycle.
  v_pmonth := extract(month from coalesce(v_wd.cycle_end, now()))::integer;
  v_pyear  := extract(year  from coalesce(v_wd.cycle_end, now()))::integer;

  select id into v_ledger_id
    from profits
   where user_id = v_wd.user_id
     and month   = v_pmonth
     and year    = v_pyear
   order by id
   limit 1
   for update;

  if found then
    update profits
       set amount = v_profit,
           status = 'paid',
           payout_date = now()
     where id = v_ledger_id;
  else
    insert into profits (user_id, month, year, amount, status, payout_date, reminder_sent)
    values (v_wd.user_id, v_pmonth, v_pyear, v_profit, 'paid', now(), false);
  end if;

  -- Member notification + bilingual inbox message.
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    v_wd.user_id,
    'Withdrawal Completed',
    'نکاسی مکمل',
    format('Your monthly profit withdrawal of %s PKR (%s%% monthly rate on %s PKR, fee %s PKR, net %s PKR) has been completed and sent to your account.',
      to_char(v_profit, 'FM999999999'), p_rate, to_char(v_principal, 'FM999999999'),
      v_fee, to_char(v_net, 'FM999999999')),
    format('آپ کی ماہانہ منافع نکاسی (%s روپے، فیس %s روپے، خالص %s روپے) مکمل ہو کر آپ کے اکاؤنٹ میں بھیج دی گئی ہے۔',
      to_char(v_profit, 'FM999999999'), v_fee, to_char(v_net, 'FM999999999')),
    false
  );

  insert into messages (user_id, sender, message, message_ur, is_read)
  values (
    v_wd.user_id,
    'system',
    format('Your monthly profit withdrawal of Rs %s has been completed and sent to your account (rate %s%%, fee Rs %s, net Rs %s). Your investment of Rs %s remains active.',
      to_char(v_profit, 'FM999999999'), p_rate, v_fee, to_char(v_net, 'FM999999999'),
      to_char(v_principal, 'FM999999999')),
    format('آپ کی ماہانہ منافع نکاسی (%s روپے) مکمل ہو گئی ہے اور آپ کے اکاؤنٹ میں بھیج دی گئی ہے۔ آپ کی سرمایہ کاری (%s روپے) فعال ہے۔',
      to_char(v_profit, 'FM999999999'), to_char(v_principal, 'FM999999999')),
    false
  );

  -- Audit trail: actor, rate, cycle, before/after values preserved.
  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, previous_status, new_status, amount, note)
  values
    ('withdrawal', v_wd.id, v_wd.user_id, p_actor, 'pending', 'completed', v_profit,
     format('monthly profit withdrawal completed by super admin: principal %s PKR × %s%% = %s PKR, fee %s PKR, net %s PKR; cycle %s (%s .. %s)',
       to_char(v_principal, 'FM999999999'), p_rate, to_char(v_profit, 'FM999999999'),
       v_fee, to_char(v_net, 'FM999999999'),
       coalesce(v_wd.cycle_number::text, 'legacy'),
       coalesce(v_wd.cycle_start::text, '-'),
       coalesce(v_wd.cycle_end::text, '-')));

  -- AUTHORITATIVE "next withdrawal completed" event: activate any pending
  -- investment upgrade (service-role-only function; invoked in-process).
  perform public.activate_pending_upgrade(v_wd.user_id, 'withdrawal', v_wd.id);

  return jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_wd.id,
    'principal', v_principal,
    'rate', p_rate,
    'profit', v_profit,
    'fee', v_fee,
    'net', v_net,
    'cycle_number', v_wd.cycle_number
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$function$
;
CREATE OR REPLACE FUNCTION public.member_return_hold_active(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.investment_returns
     where user_id = p_user and status = 'approved'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.request_investment_upgrade(p_new_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- FIXED: numeric-safe validity check (was: not isfinite(p_new_amount)).
  if p_new_amount is null
     or p_new_amount = 'NaN'::numeric
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
$function$
;
CREATE OR REPLACE FUNCTION public.request_return_investment()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.request_withdrawal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user      uuid := auth.uid();
  v_principal numeric(14,2);
  v_cycle     record;
  v_wd        record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- Serialise concurrent financial mutations for this user.
  perform 1 from profiles where id = v_user for update;

  -- GATE 1: approved return-investment hold blocks ALL withdrawals.
  if public.member_return_hold_active(v_user) then
    return jsonb_build_object('ok', false, 'reason', 'return_investment_hold');
  end if;

  -- GATE 2: an unresolved return REQUEST also blocks new withdrawals.
  if exists(select 1 from investment_returns
             where user_id = v_user and status = 'requested') then
    return jsonb_build_object('ok', false, 'reason', 'return_request_pending');
  end if;

  -- GATE 3: an unresolved withdrawal (pending/approved) blocks a new one.
  if exists(select 1 from withdrawals
             where user_id = v_user and status in ('pending','approved')) then
    return jsonb_build_object('ok', false, 'reason', 'unresolved_withdrawal_exists');
  end if;

  -- AUTHORITATIVE principal (never client-supplied).
  v_principal := public.active_investment(v_user);
  if v_principal <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_approved_investment');
  end if;

  -- GATE 4: current 30-day cycle; actionable only in the final 24 hours of
  -- the cycle or after it has completed.
  select * into v_cycle from public.withdrawal_current_cycle(v_user);
  if not found or v_cycle.cycle_end is null then
    return jsonb_build_object('ok', false, 'reason', 'no_cycle_anchor');
  end if;

  if now() < v_cycle.cycle_end - interval '24 hours' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_eligible_30_days',
      'cycle_number', v_cycle.cycle_number,
      'cycle_end', v_cycle.cycle_end,
      'eligible_at', v_cycle.cycle_end - interval '24 hours'
    );
  end if;

  -- GATE 5: idempotency — one non-rejected withdrawal per cycle
  -- (also enforced atomically by the partial unique index).
  if exists(select 1 from withdrawals
             where user_id = v_user
               and cycle_number = v_cycle.cycle_number
               and status in ('pending','approved','completed')) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'duplicate_cycle_withdrawal',
      'cycle_number', v_cycle.cycle_number
    );
  end if;

  -- Create the request. amount/fee/net_amount/rate stay NULL until the
  -- Super Admin selects the rate and complete_profit_withdrawal() computes
  -- them server-side.
  insert into withdrawals
    (user_id, amount, fee, net_amount, status, user_details,
     monthly_profit_rate, cycle_number, cycle_start, cycle_end)
  values
    (v_user, null, null, null, 'pending', null,
     null, v_cycle.cycle_number, v_cycle.cycle_start, v_cycle.cycle_end)
  returning * into v_wd;

  -- Member confirmation notification + bilingual inbox message.
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  values (
    v_user,
    'Withdrawal Request Received',
    'درخواست موصول ہو گئی',
    format('Your monthly profit withdrawal request for cycle #%s has been received. Please wait for the Super Admin to process it.', v_cycle.cycle_number),
    format('آپ کی ماہانہ منافع نکاسی کی درخواست (سائیکل #%s) موصول ہو گئی ہے۔ براہِ کرم سپر ایڈمن کی پروسیسنگ کا انتظار کریں۔', v_cycle.cycle_number),
    false
  );

  insert into messages (user_id, sender, message, message_ur, is_read)
  values (
    v_user,
    'system',
    format('Your monthly profit withdrawal request for cycle #%s has been received. Please wait a few hours.', v_cycle.cycle_number),
    format('آپ کی ماہانہ منافع نکاسی کی درخواست (سائیکل #%s) موصول ہو گئی ہے۔ براہِ کرم چند گھنٹے انتظار کریں۔', v_cycle.cycle_number),
    false
  );

  -- Super Admin in-app notification(s).
  insert into notifications (user_id, title, title_ur, message, message_ur, is_read)
  select
    p.id,
    'New Withdrawal Request',
    'نئی نکاسی درخواست',
    format('%s (@%s) has requested their monthly profit withdrawal for cycle #%s (investment: %s PKR).',
      coalesce(nullif(p.full_name, ''), p.username), p.username,
      v_cycle.cycle_number, to_char(v_principal, 'FM999999999')),
    format('%s نے سائیکل #%s کے لیے ماہانہ منافع نکاسی کی درخواست دی ہے۔',
      coalesce(nullif(p.full_name, ''), p.username), v_cycle.cycle_number),
    false
  from profiles p
  where p.role = 'admin';

  -- Audit trail.
  insert into financial_audit_log
    (entity, entity_id, user_id, actor_id, new_status, amount, note)
  values
    ('withdrawal', v_wd.id, v_user, v_user, 'pending', null,
     format('monthly profit withdrawal requested via request_withdrawal(); cycle #%s (%s .. %s); principal %s PKR',
       v_cycle.cycle_number, v_cycle.cycle_start, v_cycle.cycle_end,
       to_char(v_principal, 'FM999999999')));

  return jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_wd.id,
    'cycle_number', v_cycle.cycle_number,
    'cycle_start', v_cycle.cycle_start,
    'cycle_end', v_cycle.cycle_end,
    'principal', v_principal
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.withdrawal_current_cycle(p_user uuid)
 RETURNS TABLE(cycle_number integer, cycle_start timestamp with time zone, cycle_end timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    (floor(extract(epoch from (now() - a.anchor)) / (30 * 86400)) + 1)::integer,
    a.anchor + floor(extract(epoch from (now() - a.anchor)) / (30 * 86400))
               * interval '30 days',
    a.anchor + (floor(extract(epoch from (now() - a.anchor)) / (30 * 86400)) + 1)
               * interval '30 days'
  from (
    select public.withdrawal_eligibility_anchor(p_user) as anchor
  ) a
  where a.anchor is not null;
$function$
;
CREATE OR REPLACE FUNCTION public.withdrawal_eligibility_anchor(p_user uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select profit_activation_date from public.profiles where id = p_user),
    (select min(approved_at) from public.deposits
      where user_id = p_user and status = 'approved'),
    (select min(uploaded_at) from public.deposits
      where user_id = p_user and status = 'approved')
  );
$function$
;
