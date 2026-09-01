-- ============================================================================
-- Global notification read-state
--
-- PROBLEM (verified by API-route inspection, not assumed):
-- `notifications` rows with user_id = NULL are SHARED broadcast rows. The
-- member API (app/api/notifications) used the service-role client — which
-- bypasses RLS — and its mark-read filter explicitly included the
-- `user_id.is.null` arm, so ANY member could flip `is_read` on the global
-- row, changing read state for EVERY member at once.
--
-- FIX DESIGN: the global row becomes an immutable catalog row for members.
-- Per-user read state for global broadcasts lives in `notification_reads`,
-- giving each member an independent read/unread state:
--   Member A marks read  ->  only A's read-state row is created.
--   Member B's unread state is untouched.
--
-- WHY NOT remove the global row: the admin "all" broadcast fans out to
-- ACTIVE users only; the global row is the only copy that users who were
-- inactive at broadcast time — or who register later — will ever receive
-- (member GET returns own rows OR user_id IS NULL). Removing it would
-- silently drop those users' broadcasts, changing admin/global semantics.
-- ============================================================================

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default timezone('utc'::text, now()),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists "notification_reads select own" on public.notification_reads;
create policy "notification_reads select own" on public.notification_reads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_reads insert own" on public.notification_reads;
create policy "notification_reads insert own" on public.notification_reads
  for insert to authenticated
  with check (user_id = auth.uid());

-- Deliberately NO update/delete policies: read state is monotonic — a member
-- can never un-read, delete a read-state row, or touch another user's row.
-- The application writes through the service-role key (server-derived
-- user_id only); RLS protects against all direct client access.

-- anon has no business with read state at all.
revoke all on public.notification_reads from anon;
