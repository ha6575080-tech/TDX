-- ============================================================================
-- DEPOSITS AMOUNT RANGE CHECK — PKR 5,000 – 2,000,000
-- Enforces the business rule at database level as final guard.
-- Previously enforced only in DepositForm.tsx client validation.
-- Server validation mirrors this via lib/investment.ts isValidDepositAmount().
-- Additive, forward-only, no destructive cleanup, no historical UPDATE.
-- If existing historical rows violate the range, this migration will fail
-- and must be reported without automatically modifying financial records.
-- ============================================================================

-- Only create the constraint if it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposits_amount_range_check'
      and conrelid = 'public.deposits'::regclass
  ) then
    alter table public.deposits
      add constraint deposits_amount_range_check
      check (amount >= 5000 and amount <= 2000000);
  end if;
end $$;

-- Verification (run after apply):
--   SELECT conname FROM pg_constraint WHERE conname='deposits_amount_range_check';
--   Should return one row. Invalid historical rows would have prevented creation.
comment on constraint deposits_amount_range_check on public.deposits is 'Business rule: deposit amount must be between PKR 5,000 and 2,000,000 inclusive. Client validation in DepositForm.tsx, server validation in lib/investment.ts isValidDepositAmount(), DB CHECK is final.';
