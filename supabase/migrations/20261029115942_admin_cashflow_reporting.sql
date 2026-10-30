-- Read-only, admin-server reporting. Aggregate in Postgres so totals are not
-- silently truncated by the Data API's row limit. No financial row is changed.
create or replace function public.admin_cashflow_report(p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable set search_path = public as $report$
with
deposit_events as (
  select id, user_id, amount, coalesce(approved_at, uploaded_at) as event_at
  from public.deposits where status = 'approved'
),
withdrawal_events as (
  select id, user_id, amount as gross, fee, coalesce(net_amount, amount - coalesce(fee,0)) as amount,
    coalesce(processed_at, requested_at) as event_at,
    extract(month from coalesce(cycle_end, processed_at, requested_at))::int as month,
    extract(year from coalesce(cycle_end, processed_at, requested_at))::int as year
  from public.withdrawals where status = 'completed'
),
withdrawal_months as (
  select user_id, month, year, sum(gross) as gross from withdrawal_events group by user_id, month, year
),
legacy_profit_events as (
  -- A completed withdrawal also writes its profit to the monthly ledger. It
  -- is one payment, not two cash outflows. Match either the event or aggregate.
  select p.id, p.user_id, p.amount, p.payout_date as event_at, p.month, p.year
  from public.profits p where p.status = 'paid'
    and not exists (select 1 from withdrawal_events w where w.user_id=p.user_id and w.month=p.month and w.year=p.year and w.gross=p.amount)
    and not exists (select 1 from withdrawal_months w where w.user_id=p.user_id and w.month=p.month and w.year=p.year and w.gross=p.amount)
),
payout_events as (
  select id, user_id, amount, created_at as event_at, month, year from public.payouts where status='paid'
),
other_profit_events as (
  select id, amount, event_at from payout_events
  union all select id, amount, event_at from legacy_profit_events
),
return_events as (
  select id, returned_amount as amount, completed_at as event_at from public.investment_returns where status='completed'
),
totals as (
  select
    (select coalesce(sum(amount),0) from deposit_events where event_at>=p_start and event_at<=p_end) as deposits,
    (select coalesce(sum(amount),0) from other_profit_events where event_at>=p_start and event_at<=p_end) as payouts,
    (select coalesce(sum(amount),0) from withdrawal_events where event_at>=p_start and event_at<=p_end) as withdrawals,
    (select coalesce(sum(amount),0) from return_events where event_at>=p_start and event_at<=p_end) as returns,
    (select coalesce(sum(fee),0) from withdrawal_events where event_at>=p_start and event_at<=p_end) as fees,
    (select count(*) from public.profiles where role='user') as members,
    (select count(*) from public.profiles where role='user' and is_active and not is_suspended) as active_members
)
select jsonb_build_object(
  'summary', jsonb_build_object('totalDeposits',deposits,'totalPayouts',payouts,'totalWithdrawals',withdrawals,
    'totalReturns',returns,'feesRetained',fees,'netCashFlow',deposits-payouts-withdrawals-returns,
    'netProfit',deposits-payouts-withdrawals-returns,'totalUsers',members,'activeUsers',active_members),
  'breakdown', jsonb_build_object(
    'deposits',coalesce((select jsonb_agg(jsonb_build_object('amount',e.amount,'created_at',e.event_at)) from (select * from deposit_events where event_at>=p_start and event_at<=p_end order by event_at desc limit 200) e),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object('amount',e.amount,'created_at',e.event_at)) from (select * from other_profit_events where event_at>=p_start and event_at<=p_end order by event_at desc limit 200) e),'[]'::jsonb),
    'withdrawals',coalesce((select jsonb_agg(jsonb_build_object('amount',e.amount,'created_at',e.event_at)) from (select * from withdrawal_events where event_at>=p_start and event_at<=p_end order by event_at desc limit 200) e),'[]'::jsonb)
  ),
  'reconciliationRequired',
    exists(select 1 from legacy_profit_events p join withdrawal_months w using(user_id,month,year) where p.event_at>=p_start and p.event_at<=p_end)
    or exists(select 1 from payout_events p join public.profits f using(user_id,month,year) where f.status='paid' and p.event_at>=p_start and p.event_at<=p_end)
    or exists(select 1 from return_events where amount is null and event_at>=p_start and event_at<=p_end),
  'breakdownLimit',200
) from totals;
$report$;
revoke all on function public.admin_cashflow_report(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_cashflow_report(timestamptz,timestamptz) to service_role;
