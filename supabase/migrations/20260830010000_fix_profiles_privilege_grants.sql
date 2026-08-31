-- ============================================================================
-- P0 POLICY DRIFT REMEDIATION — profiles privilege escalation + PII exposure
--
-- LIVE-VERIFIED FINDINGS (empirical, non-destructive same-value probes,
-- 2026-08-30, run as a genuine role='user' member account):
--
-- FINDING 1 (CRITICAL — privilege escalation):
--   A member JWT can PATCH profiles.role / is_active / investment_amount /
--   profit_activation_date on their OWN row (HTTP 204). Root cause: the
--   table-level `GRANT UPDATE ON public.profiles TO authenticated` from the
--   baseline is still in effect. The intended column-restricted grant set
--   (migration 20260822173247_p0_security_hardening.sql, lines 204-210) was
--   never applied to the live database. A table-level UPDATE privilege
--   overrides every column-level restriction, so role is member-writable and
--   any member can elevate to admin (requireAdmin() trusts profiles.role).
--
-- FINDING 2 (HIGH — admin-row PII read):
--   An unscoped `GET /rest/v1/profiles` returns rows beyond the caller's own
--   to a plain member (observed: 2 rows). Live policy
--   "Users see own profile, admins see all" uses `(auth.uid() = id OR
--   role = 'admin')` — the role check is evaluated on the CANDIDATE row, so
--   every member can read every ADMIN's profile row (name, mobile, address,
--   account number). The intended rule is owner-or-is_admin() only.
--
-- FINDING 3 — RETRACTED (probe artifact):
--   The original observation "8 foreign message rows" was a bug in the probe
--   script: it counted ALL rows visible to the fixture as foreign without
--   filtering by user_id. Post-fix verification (user_id-filtered) shows
--   total 8 | own 8 | FOREIGN 0 — the fixture was seeing ONLY its own chat
--   history (created by multilingual E2E tests). Messages RLS is enforcing
--   owner-only access correctly.
--
-- FINDING 4 — RETRACTED (probe artifact):
--   Same bug: "5 foreign task rows" were the fixture's OWN tasks (own 5,
--   FOREIGN 0 after filtering). Tasks RLS is enforcing correctly.
--
-- The messages/tasks policy rebuilds in this migration are therefore NOT
-- fixes for observed cross-user reads — they are retained as defense-in-depth,
-- aligning the live policies with the intended hardening end-state (the
-- baseline "… manage own …" ALL-to-public policies allowed members UPDATE and
-- DELETE on their own rows; the rebuilt set is strictly scoped and no wider
-- than intended).
--
-- All FINANCIAL tables were probed the same way and correctly block cross-user
-- reads: deposits, withdrawals, profits, investment_returns,
-- investment_upgrades, referrals, financial_audit_log -> 0 foreign rows.
--
-- FIX (smallest safe change — profiles, messages, tasks ONLY):
--   1. Rebuild the three profiles policies to the intended owner-or-admin set.
--   2. Revoke the table-level UPDATE privilege and re-grant exactly the ten
--      member-editable columns (role, is_active, is_suspended, package_id,
--      investment_amount, profit_activation_date, referral_bonus and every
--      other privileged column become member-IMMUTABLE).
--   3. INSERT stays available ONLY for the register fallback path and ONLY on
--      the nine register-payload columns (role is never client-insertable);
--      DELETE is revoked outright (financial ON DELETE CASCADE safety).
--   4. Rebuild messages policies: select own, insert own.
--   5. Rebuild tasks policies: select own-or-admin, insert own, update own.
--
-- Admin operations are unaffected: every admin route mutates profiles via the
-- service-role client (createServiceRoleClient), which bypasses RLS and
-- column grants by design (verified: admin/users toggle_suspend, agents/
-- onboard, admin receipts/payouts). Registration inserts the profile row via
-- the SECURITY DEFINER handle_new_user() trigger — also unaffected.
--
-- IDEMPOTENT: safe to re-run. Touches NOTHING else — no financial table, no
-- financial RPC, no storage bucket/policy, no auth setting.
--
-- RETEST after applying (no code changes needed):
--   node scripts/probe-policy-drift.mjs
--   Expected: role/is_active/investment_amount/profit_activation_date
--             -> "blocked" (4xx); username/full_name -> 204; unscoped
--             profiles GET -> exactly 1 row (own).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rebuild profiles policies (drop ALL current names — the live set contains
--    drifted baseline policies; recreate the intended minimal explicit set)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', r.policyname);
  end loop;
end $$;

-- Members see ONLY their own row; admins read via the trusted is_admin()
-- helper (evaluates the CALLER's role, never the row's).
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Client-side INSERT is used ONLY by the register fallback path (see 2b) and
-- is column-restricted + pinned to the caller's own id. Registration normally
-- creates the profile row via the SECURITY DEFINER signup trigger.
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Members may update ONLY their own row — and (via the column grants below)
-- ONLY the non-privileged columns.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. Column-level write protection (the actual escalation fix).
--    NOTE: the table-level REVOKE is essential — while any table-level UPDATE
--    privilege exists, column-level grants cannot restrict anything.
-- ----------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;

grant update (
  username, full_name, address, city, mobile_number,
  account_number, payment_method, profile_picture_url,
  selfie_url, referral_code
) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 2b. INSERT — column-restricted (register fallback path REQUIRES it).
--    The baseline has NO insert policy on profiles (RLS deny-by-default), but
--    app/register/page.tsx performs a client-side upsert as the documented
--    fallback when the signup trigger fails (handle_new_user() swallows
--    exceptions such as username collisions). That upsert therefore needs
--    INSERT privilege — restricted to EXACTLY the register payload columns
--    (id, username, full_name, address, city, mobile_number, account_number,
--    payment_method, referral_code). Privileged columns (role, is_active,
--    is_suspended, package_id, investment_amount, profit_activation_date,
--    referral_bonus, selfie_verified, ...) are NOT insertable: a member
--    self-insert always gets role='user' (column default). The
--    profiles_insert_self policy below additionally pins id = auth.uid(),
--    and the PK guarantees it can only fire when no profile row exists yet.
-- ----------------------------------------------------------------------------
revoke insert on public.profiles from anon, authenticated;

grant insert (
  id, username, full_name, address, city, mobile_number,
  account_number, payment_method, referral_code
) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 2c. DELETE — no member delete path exists anywhere in the application, and
--    profiles.id cascades ON DELETE into deposits / profits / investment_
--    returns / referrals / tasks / withdrawals (financial history). Revoke so
--    a future permissive policy mistake can never expose cascade deletion.
-- ----------------------------------------------------------------------------
revoke delete on public.profiles from anon, authenticated;

-- Everything else (role, is_active, is_suspended, package_id,
-- investment_amount, profit_activation_date, referral_bonus, verification
-- flags, ...) is now writable ONLY by the server (service role / definer
-- functions / admin routes).

-- ----------------------------------------------------------------------------
-- 3. messages — defense-in-depth rebuild (retracted finding; see header).
--    Members read/write ONLY their own thread (the chat API always keys rows
--    to the authenticated user's id); admin support access flows through
--    service-role APIs (bypasses RLS). No update/delete policies: a member
--    never edits or removes chat rows.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'messages'
  loop
    execute format('drop policy if exists %I on public.messages', r.policyname);
  end loop;
end $$;

create policy "messages_select_own" on public.messages
  for select to authenticated
  using (user_id = auth.uid());

create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. tasks — defense-in-depth rebuild (retracted finding; see header).
--    Owner-scoped select/insert/update; no member delete (server/admin manage
--    lifecycle via service role).
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
  loop
    execute format('drop policy if exists %I on public.tasks', r.policyname);
  end loop;
end $$;

create policy "tasks_select_own_or_admin" on public.tasks
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "tasks_insert_own" on public.tasks
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());