-- TDX User Bootstrap
-- Guarantees every newly registered user has a profiles row and a settings row.
--
-- Design rationale:
-- Client-side bootstrap after signup is fragile because email confirmation can
-- complete outside the app (the Supabase confirmation link lands on the
-- redirect URL, not necessarily through our React flow). A trigger on
-- auth.users is the safest way to guarantee both rows exist no matter how the
-- user was created (app signup, Supabase dashboard, admin API, etc.).
--
-- SECURITY DEFINER: This function runs with the privileges of its owner
-- (the table owner / postgres in the migration context) so that the inserts
-- into public.profiles and public.settings bypass RLS. This is required
-- because the trigger fires on auth.users insert, before the new user has
-- any session, so RLS would otherwise block the inserts. The function is
-- intentionally narrow: it only inserts rows for new.id and sets a locked
-- search_path to public. This migration is intended to run under the
-- table-owner/postgres migration context.
--
-- NOTE: This migration is local-only for now. Do NOT apply remotely until
-- explicitly requested.

-- Function invoked on new auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();