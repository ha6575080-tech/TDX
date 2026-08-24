-- TDX Investments Table
-- User-owned investments with return tracking

create type public.investment_status as enum ('active', 'completed', 'cancelled', 'pending');

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  investment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  type text not null check (type in ('stocks', 'mutual_funds', 'bonds', 'real_estate', 'crypto', 'cash', 'other')),
  description text not null,
  expected_return numeric(14, 2) check (expected_return is null or expected_return >= 0),
  actual_return numeric(14, 2) check (actual_return is null or actual_return >= 0),
  status public.investment_status not null default 'active',
  exclude_from_profit boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger for updated_at
create trigger handle_investments_updated_at
  before update on public.investments
  for each row execute function public.handle_updated_at();

-- Enforce that an investment may only reference a category owned by the
-- same user (function defined in migration 002).
create trigger enforce_investment_category_ownership
  before insert or update on public.investments
  for each row execute function public.enforce_category_ownership();
