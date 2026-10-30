-- Managed pg_net grants cannot be removed by the project postgres role.
-- Queue only a two-minute HMAC signature, never the long-lived Vault secret.
create or replace function public.invoke_tdx_reminder_worker()
returns bigint language plpgsql security definer set search_path='' as $worker$
declare v_secret text; v_timestamp text; v_nonce text; v_payload text; v_signature text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='tdx_reminder_cron_secret';
  if v_secret is null or length(v_secret)<32 then raise exception 'Reminder scheduler credential is missing'; end if;
  v_timestamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_nonce:=gen_random_uuid()::text;
  v_payload:='GET:/api/cron/payout-reminders:'||v_timestamp||':'||v_nonce;
  v_signature:=encode(extensions.hmac(v_payload,v_secret,'sha256'),'hex');
  return net.http_get(url:='https://tdx-plum.vercel.app/api/cron/payout-reminders',
    headers:=jsonb_build_object('Authorization','TDX-HMAC '||v_timestamp||'.'||v_nonce||'.'||v_signature),timeout_milliseconds:=55000);
end;
$worker$;
revoke all on function public.invoke_tdx_reminder_worker() from public,anon,authenticated;
grant execute on function public.invoke_tdx_reminder_worker() to service_role;
