-- All task creation, evidence completion and missed-day deductions take the
-- same profile lock. There is no interval in which a refresh can charge twice.
create or replace function public.ensure_member_tasks(p_user uuid, p_links text[])
returns jsonb language plpgsql security definer set search_path=public as $tasks$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_count int;
  v_dates date[];
  v_missed int;
  v_tasks jsonb;
begin
  perform 1 from public.profiles where id=p_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','member_not_found'); end if;
  if exists(select 1 from public.profiles where id=p_user and is_suspended) then
    return jsonb_build_object('ok',false,'reason','account_suspended');
  end if;
  if p_links is null or cardinality(p_links)<>5
    or (select count(distinct link) from unnest(p_links) as link)<>5
    or exists(select 1 from unnest(p_links) as link where link is null or link !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]+$') then
    raise exception 'Exactly five valid task links are required';
  end if;
  select count(*) into v_count from public.tasks where user_id=p_user and task_date=v_today;
  if v_count<5 then
    insert into public.tasks(user_id,task_date,youtube_link,completed,deduction_applied)
    select p_user,v_today,link,false,false from unnest(p_links) with ordinality as links(link,position)
    where not exists(select 1 from public.tasks t where t.user_id=p_user and t.task_date=v_today and t.youtube_link=links.link)
    order by position limit greatest(0,5-v_count);
  end if;
  select array_agg(task_date) into v_dates from (
    select task_date from public.tasks where user_id=p_user and task_date<v_today
    group by task_date having count(*) filter(where completed)<5 and not bool_or(coalesce(deduction_applied,false))
  ) missed;
  v_missed := coalesce(cardinality(v_dates),0);
  if v_missed>0 then
    update public.profiles set daily_tasks_failed=coalesce(daily_tasks_failed,0)+v_missed,
      total_deductions=coalesce(total_deductions,0)+v_missed*200 where id=p_user;
    update public.tasks set deduction_applied=true where user_id=p_user and task_date=any(v_dates);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'task_date',task_date,'youtube_link',youtube_link,
    'screenshot_url',screenshot_url,'completed',completed,'completed_at',completed_at) order by task_date,id),'[]'::jsonb)
  into v_tasks from public.tasks where user_id=p_user and not completed;
  return jsonb_build_object('ok',true,'missedDays',v_missed,'pendingTasks',v_tasks);
end;
$tasks$;

create or replace function public.complete_member_task(p_user uuid,p_task uuid,p_path text,p_links text[])
returns jsonb language plpgsql security definer set search_path=public as $complete$
declare v_task record; v_result jsonb;
begin
  perform 1 from public.profiles where id=p_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','member_not_found'); end if;
  if exists(select 1 from public.profiles where id=p_user and is_suspended) then
    return jsonb_build_object('ok',false,'reason','account_suspended');
  end if;
  select * into v_task from public.tasks where id=p_task and user_id=p_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','task_not_found'); end if;
  if v_task.completed then return jsonb_build_object('ok',true,'screenshot_url',v_task.screenshot_url); end if;
  if p_path is null or split_part(p_path,'/',1)<>p_user::text or array_length(string_to_array(p_path,'/'),1)<>2
    or split_part(p_path,'/',2) in ('','.','..') or p_path ~ '[\\%]'
    or not exists(select 1 from storage.objects where bucket_id='task-screenshots' and name=p_path) then
    return jsonb_build_object('ok',false,'reason','invalid_evidence');
  end if;
  v_result := public.ensure_member_tasks(p_user,p_links);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  update public.tasks set completed=true,completed_at=now(),screenshot_url=p_path where id=p_task and user_id=p_user;
  return jsonb_build_object('ok',true,'screenshot_url',p_path);
end;
$complete$;
revoke all on function public.ensure_member_tasks(uuid,text[]),public.complete_member_task(uuid,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.ensure_member_tasks(uuid,text[]),public.complete_member_task(uuid,uuid,text,text[]) to service_role;
