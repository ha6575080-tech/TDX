-- Supabase-managed scheduler; the HTTP credential lives only in Vault.
-- Apply after the reminder worker is deployed and its Vault secret is installed.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- pg_net stores request headers temporarily. Keep those away from API roles.
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
revoke usage on schema net from public,anon,authenticated;
revoke all on vault.decrypted_secrets,vault.secrets from public,anon,authenticated;

create or replace function public.invoke_tdx_reminder_worker()
returns bigint language plpgsql security definer set search_path='' as $worker$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='tdx_reminder_cron_secret';
  if v_secret is null or length(v_secret)<32 then raise exception 'Reminder scheduler credential is missing'; end if;
  return net.http_get(url:='https://tdx-plum.vercel.app/api/cron/payout-reminders',
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret),timeout_milliseconds:=55000);
end;
$worker$;
revoke all on function public.invoke_tdx_reminder_worker() from public,anon,authenticated;
grant execute on function public.invoke_tdx_reminder_worker() to service_role;
select cron.schedule('tdx-payout-reminder-worker','*/5 * * * *','select public.invoke_tdx_reminder_worker();');
