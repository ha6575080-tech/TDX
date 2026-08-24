-- TDX Indexes
-- Performance indexes for common query patterns

-- Transactions: filter by user + date (dashboard/reports)
create index idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

-- Transactions: filter by user + type (income/expense views)
create index idx_transactions_user_type
  on public.transactions (user_id, type);

-- Transactions: filter by user + category
create index idx_transactions_user_category
  on public.transactions (user_id, category_id);

-- Transactions: filter by user + exclude flag (profit calculations)
create index idx_transactions_user_exclude
  on public.transactions (user_id, exclude_from_profit);

-- Investments: filter by user + date
create index idx_investments_user_date
  on public.investments (user_id, investment_date desc);

-- Investments: filter by user + status
create index idx_investments_user_status
  on public.investments (user_id, status);

-- Investments: filter by user + exclude flag (profit calculations)
create index idx_investments_user_exclude
  on public.investments (user_id, exclude_from_profit);

-- Categories: filter by user + type
create index idx_categories_user_type
  on public.categories (user_id, type);
