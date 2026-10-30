-- One consistent read snapshot; JSON aggregation avoids REST row-limit truncation.
-- Invoker rights and explicit session ownership preserve member isolation.
create or replace function public.member_statement_snapshot()
returns jsonb language sql stable security invoker set search_path=public as $statement$
  with actor as (select auth.uid() as id),
  member as (
    select coalesce(nullif(p.full_name,''),p.username) as full_name,p.username,p.mobile_number,p.city,p.created_at,
      case when p.role='admin' then 'admin' when p.is_active then 'active' else 'inactive' end as status
    from public.profiles p where p.id=(select id from actor) and (not coalesce(p.is_suspended,false) or p.role='admin')
  ),
  deposit_rows as (select id,amount,status,uploaded_at as created_at from public.deposits where user_id=(select id from actor)),
  legacy as (select id,amount,percentage_applied,month,year,status,created_at from public.payouts where user_id=(select id from actor)),
  profit_rows as (
    select * from legacy
    union all
    select p.id,p.amount,null::numeric as percentage_applied,p.month,p.year,p.status,p.payout_date as created_at
    from public.profits p where p.user_id=(select id from actor)
      and not exists(select 1 from legacy l where l.month=p.month and l.year=p.year and l.status='paid')
  ),
  withdrawal_rows as (select id,amount,fee,net_amount,status,requested_at as created_at,processed_at from public.withdrawals where user_id=(select id from actor)),
  return_rows as (select id,amount,returned_amount,status,requested_at as created_at,completed_at from public.investment_returns where user_id=(select id from actor))
  select jsonb_build_object('profile',to_jsonb(m),'generatedAt',statement_timestamp(),
    'deposits',(select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc nulls last,id),'[]'::jsonb) from deposit_rows d),
    'payouts',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at desc nulls last,id),'[]'::jsonb) from profit_rows p),
    'withdrawals',(select coalesce(jsonb_agg(to_jsonb(w) order by created_at desc nulls last,id),'[]'::jsonb) from withdrawal_rows w),
    'returns',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc nulls last,id),'[]'::jsonb) from return_rows r),
    'summary',jsonb_build_object(
      'totalDeposited',(select coalesce(sum(amount),0) from deposit_rows where status='approved'),
      'totalPayouts',(select coalesce(sum(amount),0) from profit_rows where status='paid'),
      'totalWithdrawn',(select coalesce(sum(coalesce(net_amount,amount)),0) from withdrawal_rows where status='completed'),
      'totalWithdrawalFees',(select coalesce(sum(fee),0) from withdrawal_rows where status='completed'),
      'totalReturnedPrincipal',(select coalesce(sum(coalesce(returned_amount,amount)),0) from return_rows where status='completed')))
  from member m;
$statement$;
revoke all on function public.member_statement_snapshot() from public,anon;
grant execute on function public.member_statement_snapshot() to authenticated;
