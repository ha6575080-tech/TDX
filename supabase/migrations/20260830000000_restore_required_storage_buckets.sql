-- ============================================================================
-- Restore the production Storage buckets REQUIRED by the current application
-- (PRIVATE) — receipts + task-screenshots
--
-- Root cause: the `receipts` and `task-screenshots` buckets are absent from
-- the production project, so deposit uploads, task screenshot uploads, and
-- every receipt/screenshot link (public or signed) return 404 NoSuchBucket.
--
-- Evidence (diagnostic, read-only):
--   receipts/<uid>/<file>            -> 404 "Bucket not found" (NoSuchBucket)
--   task-screenshots/<probe>         -> 404 "Bucket not found" (NoSuchBucket)
--   profile-pictures/<probe>         -> NoSuchKey (bucket EXISTS — control case)
--
-- This migration is ADDITIVE, IDEMPOTENT (safe to re-run), and touches
-- NOTHING outside these two buckets and their storage.objects policies:
--   * creates each bucket if missing, PRIVATE by default
--   * re-asserts the size/MIME limits the P0 hardening migration intended
--     (5 MB; image/jpeg, image/png, image/webp) — no new values invented
--   * restores owner-scoped policies matching the ACTUAL application paths
--     (both flows upload to "<auth.uid>/<filename>")
--   * does NOT create `selfies` (feature removed from the product)
--   * does NOT touch financial tables, financial RLS, or any other bucket
--
-- Admin viewing needs NO public policy: POST /api/admin/receipt
-- (requireAdmin + service-role createSignedUrl, 1-hour expiry) bypasses
-- RLS by design and is allowlisted for exactly these two buckets.
--
-- NOTE: previously emitted receipt/screenshot links that pointed at the
-- missing buckets remain dead — historical objects were lost with the
-- buckets and are intentionally NOT recoverable here. New uploads work
-- end-to-end after this migration runs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECEIPTS — private payment-receipt storage (DepositForm.tsx:69)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,                -- PRIVATE: payment receipts must never be world-readable
  5242880,              -- 5 MB, matches DepositForm MAX_RECEIPT_BYTES and P0 limits
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public            = false,
      file_size_limit   = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Owner-scoped upload: only into the user's OWN folder (<auth.uid>/<filename>).
drop policy if exists "upload receipts" on storage.objects;
create policy "upload receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Owner-scoped read: a user may view ONLY their own receipts.
-- Anonymous users get no policy -> blocked by default (private bucket).
drop policy if exists "view own receipt" on storage.objects;
create policy "view own receipt" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Owner-scoped update/delete.
drop policy if exists "update own receipt" on storage.objects;
create policy "update own receipt" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own receipt" on storage.objects;
create policy "delete own receipt" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 2. TASK-SCREENSHOTS — private task-verification storage
--    (app/tasks/page.tsx:114 uploads "<auth.uid>/<filename>";
--     app/api/tasks/complete/route.ts verifies ownership before recording)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-screenshots',
  'task-screenshots',
  false,                -- PRIVATE: task evidence follows the same owner model
  5242880,              -- 5 MB, per P0 hardening migration limits
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public            = false,
      file_size_limit   = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "upload task screenshots" on storage.objects;
create policy "upload task screenshots" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-screenshots'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "view own task screenshot" on storage.objects;
create policy "view own task screenshot" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-screenshots'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "update own task screenshot" on storage.objects;
create policy "update own task screenshot" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'task-screenshots'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'task-screenshots'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own task screenshot" on storage.objects;
create policy "delete own task screenshot" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-screenshots'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- NOTE (resolved): tasks.screenshot_url now stores the Storage OBJECT PATH
-- (see app/api/tasks/complete/route.ts) — a PRIVATE bucket makes permanent
-- public URLs impossible. Owner views use storage RLS; admin views use
-- POST /api/admin/receipt (allowlisted for task-screenshots).
-- No financial logic is affected.