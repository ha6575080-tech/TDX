-- ============================================================================
-- PERSONAL GOALS (additive, non-destructive, reversible)
--
-- New standalone engagement feature. Touches NO existing table, row,
-- policy, or financial calculation. Goal progress is DERIVED server-side
-- from the authoritative account summary — the client can never set
-- balances, achieved amounts, or profit values.
--
-- Reversible with: drop table if exists public.goals;
-- ============================================================================

create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  target_amount  numeric(14,2) not null check (target_amount > 0 and target_amount <= 100000000),
  target_date    date,
  description    text check (description is null or char_length(description) <= 500),
  -- Highest milestone (0=none,1=25%,2=50%,3=75%,4=100%) already notified.
  -- Enables event/state-transition notifications without duplicates.
  milestones_reached smallint not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.goals enable row level security;

-- Strict owner-only access. Admins have no goals access (not needed;
-- goals are private planning data).
create policy "goals_select_own" on public.goals
  for select to authenticated
  using (user_id = auth.uid());

create policy "goals_insert_own" on public.goals
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "goals_update_own" on public.goals
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goals_delete_own" on public.goals
  for delete to authenticated
  using (user_id = auth.uid());

create index if not exists goals_user_created_idx
  on public.goals (user_id, created_at desc);
