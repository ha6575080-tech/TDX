-- ============================================================================
-- HARDEN DEPOSITS INSERT POLICY (forward migration — existing data untouched)
--
-- CRITICAL FIX: The current `deposits_insert_own` policy only checks
--     WITH CHECK (user_id = auth.uid())
-- which lets a client insert a deposit with ANY status — including
-- status='approved' — bypassing the admin-approval workflow entirely.
--
-- Because member balances/active_investment are derived from APPROVED
-- deposits, a forged 'approved' deposit would fabricate investable
-- principal (real financial-loss vector: insert an approved 1,000,000
-- deposit then withdraw against it).
--
-- Secure lifecycle:
--   CLIENT insert (status MUST = 'pending')
--   -> ADMIN/SERVER approval (-> status = 'approved' via service-role)
--
-- This migration is NON-DESTRUCTIVE:
--   - no tables dropped, no columns altered, no data modified
--   - no rows updated, no balances calculated, no calculations changed
--   - no existing policies except deposits_insert_own are touched
--   - no UPDATE policy is added (users already cannot mutate their rows)
--   - admin approval is unaffected: it runs via a service-role client
--     which bypasses RLS (is_admin() path / SECURITY DEFINER RPCs)
-- ============================================================================

-- Idempotent: recreate the policy with the status guard.
drop policy if exists "deposits_insert_own" on public.deposits;

create policy "deposits_insert_own" on public.deposits
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- ============================================================================
-- VERIFICATION EXPECTATIONS
-- (safe to evaluate with non-financial test data; no money involved)
-- ============================================================================
-- Allowed:  authenticated user inserts { user_id=self, status='pending',
--              amount=<valid>, receipt_image_url=<path> }
-- Rejected: authenticated user inserts { status='approved', ... }
-- Rejected: authenticated user inserts { status='rejected', ... }
-- Rejected: authenticated user inserts { status='completed', ... }  (unknown)
-- Rejected: authenticated user inserts { user_id=<other>, status='pending', ... }
--
-- Admin approval (service-role client, bypasses RLS) is UNCHANGED.
-- 