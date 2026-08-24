-- TDX Transactions Table
-- User-owned financial transactions (income and expenses)

create type public.transaction_type as enum ('income', 'expense');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  type public.transaction_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  description text not null,
  notes text,
  transaction_date date not null default current_date,
  currency text not null default 'PKR',
  exclude_from_profit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger for updated_at
create trigger handle_transactions_updated_at
  before update on public.transactions
  for each row execute function public.handle_updated_at();

-- Enforce that a transaction may only reference a category owned by the
-- same user (function defined in migration 002).
create trigger enforce_transaction_category_ownership
  before insert or update on public.transactions
  for each row execute function public.enforce_category_ownership();
