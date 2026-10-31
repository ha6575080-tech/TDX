-- No existing balance, activation date, request or payment is changed.
-- Before activation, the first 30-day cycle is scheduled, never cycle zero.
create or replace function public.withdrawal_current_cycle(p_user uuid)
returns table(cycle_number integer,cycle_start timestamptz,cycle_end timestamptz)
language sql stable set search_path=public as $cycle$
  select (i.cycle_index+1)::integer,
    a.anchor+i.cycle_index*interval '30 days',
    a.anchor+(i.cycle_index+1)*interval '30 days'
  from (select public.withdrawal_eligibility_anchor(p_user) as anchor) a
  cross join lateral (select greatest(0,floor(extract(epoch from (now()-a.anchor))/(30*86400))) as cycle_index) i
  where a.anchor is not null and isfinite(a.anchor);
$cycle$;

-- Match the shared profile-first lock order used by requests/returns/tasks.
-- Recheck live suspension/holds and the stored cycle before completing payment.
do $completion$
declare definition text;
  lock_anchor constant text:='select * into v_wd from withdrawals where id = p_withdrawal_id for update;';
  guard_anchor constant text:='  -- AUTHORITATIVE principal for THIS member''s CURRENT investment.';
begin
  definition:=pg_get_functiondef('public.complete_profit_withdrawal(uuid,numeric,uuid)'::regprocedure);
  if position('invalid_profit_cycle' in definition)=0 then
    if position(lock_anchor in definition)=0 or position(guard_anchor in definition)=0 then raise exception 'Unexpected withdrawal completion definition'; end if;
    definition:=replace(definition,lock_anchor,$lock$
  -- Serialize member state before payment decisions.
  perform 1 from public.profiles where id=(select user_id from public.withdrawals where id=p_withdrawal_id) for update;
  select * into v_wd from withdrawals where id = p_withdrawal_id for update;$lock$);
    definition:=replace(definition,guard_anchor,$guard$
  if not exists(select 1 from public.profiles where id=v_wd.user_id and not coalesce(is_suspended,false)) then
    return jsonb_build_object('ok',false,'reason','account_suspended');
  end if;
  if exists(select 1 from public.investment_returns where user_id=v_wd.user_id and status in ('requested','approved')) then
    return jsonb_build_object('ok',false,'reason','return_investment_hold');
  end if;
  if exists(select 1 from public.profiles where id=v_wd.user_id and profit_activation_date>now()) then
    return jsonb_build_object('ok',false,'reason','not_eligible_30_days');
  end if;
  if v_wd.cycle_number is not null then
    if v_wd.cycle_number<1 or v_wd.cycle_start is null or v_wd.cycle_end is null
      or not isfinite(v_wd.cycle_start) or not isfinite(v_wd.cycle_end)
      or v_wd.cycle_end<>v_wd.cycle_start+interval '30 days' then
      return jsonb_build_object('ok',false,'reason','invalid_profit_cycle');
    end if;
    if now()<v_wd.cycle_start or now()<v_wd.cycle_end-interval '24 hours' then
      return jsonb_build_object('ok',false,'reason','not_eligible_30_days');
    end if;
  end if;
  -- AUTHORITATIVE principal for THIS member's CURRENT investment.$guard$);
    execute definition;
  end if;
end;
$completion$;
