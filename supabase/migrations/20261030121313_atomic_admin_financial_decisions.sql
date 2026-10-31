-- Forward-only transaction logic. No existing balance, status or date is changed
-- by applying this migration. Returned principal cannot be withdrawn again.
create or replace function public.active_investment(p_user uuid)
returns numeric language sql stable set search_path=public as $capital$
  select greatest(0,least(coalesce((select investment_amount from public.profiles where id=p_user),
    public.funded_principal(p_user)), public.funded_principal(p_user)));
$capital$;
revoke all on function public.active_investment(uuid) from public,anon,authenticated;
grant execute on function public.active_investment(uuid) to service_role;

create or replace function public.admin_decide_deposit(p_deposit uuid,p_actor uuid,p_action text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $deposit$
declare v_deposit record; v_user uuid; v_status text; v_before numeric; v_cycle timestamptz;
  v_en text; v_ur text; v_title text; v_title_ur text;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action is null or p_action not in ('approve','reject') then return jsonb_build_object('ok',false,'reason','invalid_action'); end if;
  select user_id into v_user from public.deposits where id=p_deposit;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  perform 1 from public.profiles where id=v_user for update;
  select * into v_deposit from public.deposits where id=p_deposit for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_deposit.status<>'pending' then return jsonb_build_object('ok',false,'reason','already_processed'); end if;
  v_before := public.active_investment(v_user);
  v_status := case p_action when 'approve' then 'approved' else 'rejected' end;
  v_cycle := now()+interval '1 day';
  update public.deposits set status=v_status,reviewed_at=now(),reviewed_by=p_actor,
    approved_at=case when p_action='approve' then now() else approved_at end,
    invoice_url=case when p_action='approve' then '/invoice/'||p_deposit::text else invoice_url end,
    next_payout_date=case when p_action='approve' then v_cycle+interval '30 days' else next_payout_date end,
    admin_notes=case when p_action='reject' then left(coalesce(p_notes,'Verification did not pass'),500) else admin_notes end
  where id=p_deposit;
  if p_action='approve' then
    update public.profiles set is_active=true,profit_activation_date=v_cycle,
      investment_amount=case when v_before<=0 then null else investment_amount end where id=v_user;
    v_title:='Deposit Approved'; v_title_ur:='ڈپازٹ منظور';
    v_en:=format('Your deposit of Rs %s has been received and approved. Your monthly profit cycle starts from %s.',v_deposit.amount,to_char(v_cycle at time zone 'Asia/Karachi','DD/MM/YYYY'));
    v_ur:=format('آپ کی جمع شدہ رقم %s روپے موصول اور منظور ہو گئی ہے۔ ماہانہ منافع کا سائیکل %s سے شروع ہوگا۔',v_deposit.amount,to_char(v_cycle at time zone 'Asia/Karachi','DD/MM/YYYY'));
  else
    v_title:='Deposit Rejected'; v_title_ur:='ڈپازٹ مسترد';
    v_en:=format('Your deposit of Rs %s was not approved. %s',v_deposit.amount,coalesce(left(p_notes,500),'Please contact support for details.'));
    v_ur:=format('آپ کی جمع شدہ رقم %s روپے منظور نہیں ہوئی۔ تفصیلات کے لیے سپورٹ سے رابطہ کریں۔',v_deposit.amount);
  end if;
  insert into public.messages(user_id,sender,message,message_ur,is_read) values(v_user,'system',v_en,v_ur,false);
  insert into public.notifications(user_id,title,title_ur,message,message_ur,is_read) values(v_user,v_title,v_title_ur,v_en,v_ur,false);
  insert into public.financial_audit_log(entity,entity_id,user_id,actor_id,previous_status,new_status,amount,note)
  values('deposit',p_deposit,v_user,p_actor,'pending',v_status,v_deposit.amount,'Admin decision recorded atomically');
  return jsonb_build_object('ok',true,'status',v_status,'user_id',v_user,'amount',v_deposit.amount,'cycle_start',case when p_action='approve' then v_cycle else null end,'message',v_en);
end;
$deposit$;

create or replace function public.admin_decide_return(p_return uuid,p_actor uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $return$
declare v_return record; v_user uuid; v_status text; v_expected timestamptz; v_remaining numeric; v_up record;
  v_en text; v_ur text; v_title text; v_title_ur text;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action is null or p_action not in ('approve','reject','mark_completed') then return jsonb_build_object('ok',false,'reason','invalid_action'); end if;
  select user_id into v_user from public.investment_returns where id=p_return;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  perform 1 from public.profiles where id=v_user for update;
  select * into v_return from public.investment_returns where id=p_return for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if (p_action in ('approve','reject') and v_return.status<>'requested') or (p_action='mark_completed' and v_return.status<>'approved') then
    return jsonb_build_object('ok',false,'reason','already_processed');
  end if;
  if v_return.amount is null or v_return.amount<=0 then return jsonb_build_object('ok',false,'reason','invalid_amount'); end if;
  if p_action in ('approve','mark_completed') and v_return.amount>public.funded_principal(v_user) then return jsonb_build_object('ok',false,'reason','insufficient_funding'); end if;
  v_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'completed' end;
  if p_action='approve' then
    v_expected:=now()+interval '60 days';
    update public.investment_returns set status='approved',approved_at=now(),approved_by=p_actor,expected_return_date=v_expected where id=p_return;
    for v_up in update public.investment_upgrades set status='cancelled',decided_by=p_actor,decided_at=now(),decision_note='Cancelled automatically: return investment was approved.' where user_id=v_user and status='pending' returning id loop
      insert into public.financial_audit_log(entity,entity_id,user_id,actor_id,previous_status,new_status,note)
      values('investment_upgrade',v_up.id,v_user,p_actor,'pending','cancelled','Return investment approved');
    end loop;
    v_title:='Investment Return Approved'; v_title_ur:='سرمایہ کاری واپسی منظور';
    v_en:='Your request has been successfully processed. Please expect your return investment within 60 days.'||chr(10)||chr(10)||'Note: From now, your withdrawal, profit, and payout activities have been placed on hold.';
    v_ur:='آپ کی درخواست کامیابی سے منظور/پروسیس کر دی گئی ہے۔ براہِ کرم اپنی اصل سرمایہ کاری کی واپسی کے لیے 60 دن تک انتظار کریں۔'||chr(10)||chr(10)||'نوٹ: اب سے آپ کی رقم نکلوانے (Withdrawal)، منافع (Profit) اور Payout کی سرگرمیاں روک دی گئی ہیں۔';
  elsif p_action='reject' then
    update public.investment_returns set status='rejected',approved_by=p_actor where id=p_return;
    v_title:='Investment Return Rejected'; v_title_ur:='سرمایہ کاری واپسی مسترد';
    v_en:='Your investment return request has been rejected.'; v_ur:='آپ کی سرمایہ کاری واپسی کی درخواست مسترد کر دی گئی ہے۔';
  else
    update public.investment_returns set status='completed',completed_at=now(),completed_by=p_actor,returned_amount=amount where id=p_return;
    v_remaining:=public.funded_principal(v_user);
    update public.profiles set investment_amount=greatest(0,least(coalesce(investment_amount,v_remaining),v_remaining)),
      is_active=case when v_remaining<=0 then false else is_active end,
      profit_activation_date=case when v_remaining<=0 then null else profit_activation_date end where id=v_user;
    v_title:='Investment Returned'; v_title_ur:='سرمایہ کاری واپس';
    v_en:=format('Your return investment has been completed. PKR %s has been sent to your account.',v_return.amount);
    v_ur:=format('آپ کی سرمایہ کاری واپسی مکمل ہو گئی ہے۔ %s روپے آپ کے اکاؤنٹ میں بھیج دیے گئے ہیں۔',v_return.amount);
  end if;
  insert into public.messages(user_id,sender,message,message_ur,is_read) values(v_user,'system',v_en,v_ur,false);
  insert into public.notifications(user_id,title,title_ur,message,message_ur,is_read) values(v_user,v_title,v_title_ur,v_en,v_ur,false);
  insert into public.financial_audit_log(entity,entity_id,user_id,actor_id,previous_status,new_status,amount,note)
  values('return_investment',p_return,v_user,p_actor,v_return.status,v_status,v_return.amount,'Admin return decision recorded atomically');
  return jsonb_build_object('ok',true,'status',v_status,'expected_return_date',v_expected);
end;
$return$;
revoke all on function public.admin_decide_deposit(uuid,uuid,text,text),public.admin_decide_return(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_decide_deposit(uuid,uuid,text,text),public.admin_decide_return(uuid,uuid,text) to service_role;

-- One canonical payment writer. A 30-day cycle can end twice in a calendar
-- month; preserve both payments in the monthly ledger rather than overwrite.
do $ledger$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.complete_profit_withdrawal(uuid,numeric,uuid)'::regprocedure);
  if position('legacy_payment_exists' in definition)=0 then
    anchor:='  -- Idempotent completion (conditional update is the guard).';
    if position(anchor in definition)=0 then raise exception 'Unexpected withdrawal completion guard'; end if;
    definition:=replace(definition,anchor,$guard$
  v_pmonth:=extract(month from coalesce(v_wd.cycle_end,now()) at time zone 'Asia/Karachi')::int;
  v_pyear:=extract(year from coalesce(v_wd.cycle_end,now()) at time zone 'Asia/Karachi')::int;
  if exists(select 1 from public.payouts where user_id=v_wd.user_id and month=v_pmonth and year=v_pyear and status='paid')
    or (exists(select 1 from public.profits where user_id=v_wd.user_id and month=v_pmonth and year=v_pyear and status='paid')
      and not exists(select 1 from public.withdrawals where user_id=v_wd.user_id and status='completed'
        and extract(month from coalesce(cycle_end,processed_at,requested_at) at time zone 'Asia/Karachi')=v_pmonth
        and extract(year from coalesce(cycle_end,processed_at,requested_at) at time zone 'Asia/Karachi')=v_pyear)) then
    return jsonb_build_object('ok',false,'reason','legacy_payment_exists');
  end if;
  -- Idempotent completion (conditional update is the guard).$guard$);
    definition:=replace(definition,'v_pmonth := extract(month from coalesce(v_wd.cycle_end, now()))::integer;','v_pmonth := extract(month from coalesce(v_wd.cycle_end, now()) at time zone ''Asia/Karachi'')::integer;');
    definition:=replace(definition,'v_pyear  := extract(year  from coalesce(v_wd.cycle_end, now()))::integer;','v_pyear := extract(year from coalesce(v_wd.cycle_end, now()) at time zone ''Asia/Karachi'')::integer;');
    definition:=replace(definition,'set amount = v_profit,',$sum$
set amount = (select sum(amount) from public.withdrawals where user_id=v_wd.user_id and status='completed'
  and extract(month from coalesce(cycle_end,processed_at,requested_at) at time zone 'Asia/Karachi')=v_pmonth
  and extract(year from coalesce(cycle_end,processed_at,requested_at) at time zone 'Asia/Karachi')=v_pyear),$sum$);
    execute definition;
  end if;
end;
$ledger$;
