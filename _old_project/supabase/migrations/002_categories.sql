-- TDX Categories Table
-- User-owned categories for transactions

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense', 'investment')),
  color text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, type)
);

-- Trigger for updated_at
create trigger handle_categories_updated_at
  before update on public.categories
  for each row execute function public.handle_updated_at();

-- Category ownership enforcement
-- A transaction or investment may only reference a category belonging to the
-- SAME authenticated user. A composite foreign key (user_id, category_id) ->
-- categories(user_id, id) cannot be used here because ON DELETE SET NULL on a
-- composite FK would null the NOT NULL user_id column, breaking category
-- deletion. This trigger enforces ownership while preserving the existing
-- ON DELETE SET NULL behavior on the simple category_id FK.
create or replace function public.enforce_category_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories
      where id = new.category_id and user_id = new.user_id
    ) then
      raise exception 'Category does not belong to the authenticated user';
    end if;
  end if;
  return new;
end;
$$;
