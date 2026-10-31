-- Durable per-member, per-cycle reminder outbox. Existing ledgers are unchanged.
create table if not exists public.payout_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cycle_number integer not null check(cycle_number>0), cycle_end timestamptz not null,
  stage text not null check(stage in ('48h','24h','12h','1h','10m')),
  channel text not null check(channel in ('email','in_app')),
  member_name text not null,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0, claim_token uuid, claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(), delivered_at timestamptz, last_error text,
  created_at timestamptz not null default now(),
  unique(user_id,cycle_number,cycle_end,stage,channel)
);
alter table public.payout_reminder_jobs enable row level security;
revoke all on public.payout_reminder_jobs from public,anon,authenticated;
grant all on public.payout_reminder_jobs to service_role;
create index if not exists payout_reminder_jobs_ready on public.payout_reminder_jobs(status,next_attempt_at) where status in ('pending','processing','failed');

create or replace function public.queue_payout_reminders()
returns jsonb language plpgsql security definer set search_path=public as $queue$
declare v_job record; v_queued integer; v_sent integer:=0; v_failed integer:=0; v_text text; v_ur text;
begin
  -- The nearest due stage remains eligible until the following stage. After
  -- downtime, send one current reminder rather than a burst of old stages.
  insert into public.payout_reminder_jobs(user_id,cycle_number,cycle_end,stage,channel,member_name)
  select p.id,c.cycle_number,c.cycle_end,s.stage,ch.channel,coalesce(nullif(p.full_name,''),p.username,'Member')
  from public.profiles p
  cross join lateral public.withdrawal_current_cycle(p.id) c
  cross join lateral (select stage from (values ('48h',interval '48 hours'),('24h',interval '24 hours'),('12h',interval '12 hours'),('1h',interval '1 hour'),('10m',interval '10 minutes')) s(stage,horizon)
    where c.cycle_end>now() and c.cycle_end-now()<=s.horizon order by s.horizon limit 1) s
  cross join (values ('email'),('in_app')) ch(channel)
  where p.role<>'admin' and p.is_active and not coalesce(p.is_suspended,false) and c.cycle_number>0
    and public.active_investment(p.id)>0
    and not exists(select 1 from public.investment_returns r where r.user_id=p.id and r.status in ('requested','approved'))
    and not exists(select 1 from public.withdrawals w where w.user_id=p.id and w.cycle_number=c.cycle_number and w.status='completed')
  on conflict(user_id,cycle_number,cycle_end,stage,channel) do nothing;
  get diagnostics v_queued=row_count;

  -- Retire expired or superseded retries, never change any financial row.
  update public.payout_reminder_jobs j set status='cancelled',claim_token=null
  where (j.status in ('pending','failed') or j.status='processing' and j.claimed_at<now()-interval '2 minutes') and (
    j.cycle_end<=now() or exists(select 1 from public.payout_reminder_jobs n where n.user_id=j.user_id and n.cycle_end=j.cycle_end and n.channel=j.channel and n.created_at>j.created_at and n.stage<>j.stage)
    or not exists(select 1 from public.profiles p where p.id=j.user_id and p.is_active and not coalesce(p.is_suspended,false) and public.active_investment(p.id)>0)
    or not exists(select 1 from public.withdrawal_current_cycle(j.user_id) c where c.cycle_number=j.cycle_number and c.cycle_end=j.cycle_end)
    or exists(select 1 from public.investment_returns r where r.user_id=j.user_id and r.status in ('requested','approved'))
    or exists(select 1 from public.withdrawals w where w.user_id=j.user_id and w.cycle_number=j.cycle_number and w.status='completed'));

  -- Notification insertion and acknowledgement commit together. A failed insert
  -- rolls back the queue; a retry cannot duplicate an already delivered job.
  for v_job in select * from public.payout_reminder_jobs where channel='in_app' and status in ('pending','failed') and next_attempt_at<=now() and attempts<10 order by created_at for update skip locked limit 100 loop
    begin
    v_text:=format('Your monthly profit cycle ends on %s PKT. You can request a profit withdrawal in the final 24 hours. The administrator confirms your payout rate.',to_char(v_job.cycle_end at time zone 'Asia/Karachi','DD/MM/YYYY HH24:MI'));
    v_ur:=format('آپ کے ماہانہ منافع کا سائیکل %s پاکستانی وقت پر مکمل ہوگا۔ آخری 24 گھنٹوں میں منافع کی نکاسی کی درخواست دی جا سکتی ہے۔ ادائیگی کی شرح منتظم طے کرے گا۔',to_char(v_job.cycle_end at time zone 'Asia/Karachi','DD/MM/YYYY HH24:MI'));
    insert into public.notifications(user_id,title,title_ur,message,message_ur,is_read)
      values(v_job.user_id,'Monthly profit reminder','ماہانہ منافع کی یاد دہانی',v_text,v_ur,false);
    insert into public.notifications(user_id,title,title_ur,message,message_ur,is_read)
      select id,'Monthly profit reminder','ماہانہ منافع کی یاد دہانی',format('%s: monthly profit cycle ends %s PKT. Review monthly withdrawals.',v_job.member_name,to_char(v_job.cycle_end at time zone 'Asia/Karachi','DD/MM/YYYY HH24:MI')),v_ur,false
      from public.profiles where role='admin' and id<>v_job.user_id;
    update public.payout_reminder_jobs set status='sent',attempts=attempts+1,delivered_at=now() where id=v_job.id;
    v_sent:=v_sent+1;
    exception when others then
      update public.payout_reminder_jobs set status='failed',attempts=attempts+1,next_attempt_at=now()+interval '1 minute',last_error='Notification insertion failed; retry scheduled' where id=v_job.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('queued',v_queued,'in_app_sent',v_sent,'in_app_failed',v_failed,'exhausted',(select count(*) from public.payout_reminder_jobs where status in ('failed','processing') and attempts>=10));
end;
$queue$;

create or replace function public.claim_payout_reminder_emails(p_limit integer default 5)
returns table(id uuid,claim_token uuid,member_name text,cycle_end timestamptz,stage text)
language sql security definer set search_path=public as $claim$
  with candidates as (
    select j.id from public.payout_reminder_jobs j
    join public.profiles p on p.id=j.user_id
    where j.channel='email' and j.cycle_end>now() and j.attempts<10
      and (j.status in ('pending','failed') and j.next_attempt_at<=now() or j.status='processing' and j.claimed_at<now()-interval '2 minutes')
      and p.is_active and not coalesce(p.is_suspended,false) and public.active_investment(p.id)>0
      and exists(select 1 from public.withdrawal_current_cycle(j.user_id) c where c.cycle_number=j.cycle_number and c.cycle_end=j.cycle_end)
      and not exists(select 1 from public.investment_returns r where r.user_id=p.id and r.status in ('requested','approved'))
      and not exists(select 1 from public.withdrawals w where w.user_id=p.id and w.cycle_number=j.cycle_number and w.status='completed')
    order by j.created_at for update of j skip locked limit greatest(1,least(coalesce(p_limit,5),5))
  )
  update public.payout_reminder_jobs j set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=j.attempts+1
    from candidates c where j.id=c.id
    returning j.id,j.claim_token,j.member_name,j.cycle_end,j.stage;
$claim$;

create or replace function public.finish_payout_reminder_email(p_id uuid,p_token uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=public as $finish$
begin
  update public.payout_reminder_jobs set status=case when p_success then 'sent' else 'failed' end,
    delivered_at=case when p_success then now() else null end,
    last_error=case when p_success then null else 'Email delivery failed; retry scheduled' end,
    next_attempt_at=now()+least(attempts,10)*interval '1 minute',claim_token=null
  where id=p_id and status='processing' and claim_token=p_token;
  return found;
end;
$finish$;
revoke all on function public.queue_payout_reminders(),public.claim_payout_reminder_emails(integer),public.finish_payout_reminder_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.queue_payout_reminders(),public.claim_payout_reminder_emails(integer),public.finish_payout_reminder_email(uuid,uuid,boolean) to service_role;
comment on table public.payout_reminder_jobs is 'Transactional in-app delivery and leased, retryable admin email delivery. SMTP cannot guarantee exactly-once across a worker crash; stable Message-ID reduces duplicate delivery risk. No money is mutated.';
