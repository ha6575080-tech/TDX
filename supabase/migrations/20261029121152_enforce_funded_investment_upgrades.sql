-- Future requests/events only: never rewrite an existing balance or transaction.
create or replace function public.funded_principal(p_user uuid)
returns numeric language sql stable set search_path=public as $funding$
  select greatest(0,
    (select coalesce(sum(amount),0) from public.deposits where user_id=p_user and status='approved')
    - (select coalesce(sum(amount),0) from public.investment_returns where user_id=p_user and status='completed')
  );
$funding$;
revoke all on function public.funded_principal(uuid) from public, anon, authenticated;
grant execute on function public.funded_principal(uuid) to service_role;

do $migration$
declare
  definition text;
  anchor text;
begin
  definition := pg_get_functiondef('public.request_investment_upgrade(numeric)'::regprocedure);
  if position('unfunded_upgrade' in definition)=0 then
    anchor := '  insert into investment_upgrades';
    if position(anchor in definition)=0 then raise exception 'Unexpected upgrade request definition'; end if;
    execute replace(definition, anchor, $guard$
  if p_new_amount > 2000000 or p_new_amount > public.funded_principal(v_user) then
    return jsonb_build_object('ok',false,'reason','unfunded_upgrade','available_amount',public.funded_principal(v_user));
  end if;
  insert into investment_upgrades$guard$);
  end if;

  definition := pg_get_functiondef('public.activate_pending_upgrade(uuid,text,uuid)'::regprocedure);
  if position('unfunded_upgrade' in definition)=0 then
    anchor := '  select * into v_up';
    if position(anchor in definition)=0 then raise exception 'Unexpected upgrade activation definition'; end if;
    definition := replace(definition,anchor,'  perform 1 from public.profiles where id=p_user_id for update;' || chr(10) || anchor);
    anchor := '  update investment_upgrades';
    if position(anchor in definition)=0 then raise exception 'Unexpected upgrade activation update'; end if;
    execute replace(definition,anchor,$guard$
  if v_up.requested_amount > 2000000 or v_up.requested_amount > public.funded_principal(p_user_id) then
    return jsonb_build_object('ok',false,'activated',false,'reason','unfunded_upgrade');
  end if;
  update investment_upgrades$guard$);
  end if;

  definition := pg_get_functiondef('public.complete_profit_withdrawal(uuid,numeric,uuid)'::regprocedure);
  if position('unfunded_principal' in definition)=0 then
    anchor := '  v_principal := public.active_investment(v_wd.user_id);';
    if position(anchor in definition)=0 then raise exception 'Unexpected withdrawal definition'; end if;
    execute replace(definition,anchor,$guard$
  perform 1 from public.profiles where id=v_wd.user_id for update;
  v_principal := public.active_investment(v_wd.user_id);
  if v_principal > public.funded_principal(v_wd.user_id) then
    return jsonb_build_object('ok',false,'reason','unfunded_principal');
  end if;$guard$);
  end if;
end;
$migration$;
