-- Preserve all rows and policy ownership predicates; avoid per-row JWT lookup.
create index if not exists deposits_agent_fk_idx on public.deposits(created_by_agent);
create index if not exists deposits_package_fk_idx on public.deposits(package_id);
create index if not exists deposits_reviewer_fk_idx on public.deposits(reviewed_by);
create index if not exists investment_returns_deposit_fk_idx on public.investment_returns(deposit_id);
create index if not exists notification_reads_user_fk_idx on public.notification_reads(user_id);
create index if not exists profiles_agent_fk_idx on public.profiles(agent_id);
create index if not exists profiles_package_fk_idx on public.profiles(package_id);
create index if not exists referrals_referred_user_fk_idx on public.referrals(referred_user_id);
create index if not exists referrals_referrer_fk_idx on public.referrals(referrer_id);

do $policies$
declare p record; q text; c text; command text;
begin
  for p in select * from pg_policies where schemaname='public' loop
    q:=p.qual; c:=p.with_check;
    if q like '%auth.uid()%' and q !~* 'select[[:space:]]+auth[.]uid[(][)]' then q:=replace(q,'auth.uid()','(select auth.uid())'); end if;
    if c like '%auth.uid()%' and c !~* 'select[[:space:]]+auth[.]uid[(][)]' then c:=replace(c,'auth.uid()','(select auth.uid())'); end if;
    if q is distinct from p.qual or c is distinct from p.with_check then
      command:=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
      if q is not null then command:=command||format(' using (%s)',q); end if;
      if c is not null then command:=command||format(' with check (%s)',c); end if;
      execute command;
    end if;
  end loop;
end;
$policies$;
