# TDX Database Security Verification

## Overview

This document verifies the Row Level Security (RLS) implementation for every user-owned table in the TDX database.

## RLS Policy Summary

Every user-owned table has RLS enabled with four policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | Own profile only | Own profile only | Own profile only | Own profile only |
| `settings` | Own settings only | Own settings only | Own settings only | Own settings only |
| `categories` | Own categories only | Own categories only | Own categories only | Own categories only |
| `transactions` | Own transactions only | Own transactions only | Own transactions only | Own transactions only |
| `investments` | Own investments only | Own investments only | Own investments only | Own investments only |

## Ownership Enforcement

- **Ownership source:** `auth.uid()` — the authenticated Supabase user's ID
- **Never trusted:** `user_id` values supplied by the browser
- **Policy pattern:** `auth.uid() = user_id` (or `auth.uid() = id` for profiles)
- **RLS status:** Enabled on all user-owned tables
- **Public access:** No broad public policies exist

## User Isolation Guarantee

```
User A
  ↓
can access User A records only

User B
  ↓
cannot access User A records
```

This is enforced at the database level by RLS. Even if a malicious client attempts to query another user's records, PostgreSQL returns zero rows.

## Foreign Keys

| Table | Foreign Key | References |
|-------|-------------|------------|
| `profiles` | `id` | `auth.users(id)` |
| `settings` | `user_id` | `profiles(id)` |
| `categories` | `user_id` | `profiles(id)` |
| `transactions` | `user_id` | `profiles(id)` |
| `transactions` | `category_id` | `categories(id)` |
| `investments` | `user_id` | `profiles(id)` |
| `investments` | `category_id` | `categories(id)` |

All foreign keys use `ON DELETE CASCADE` for user ownership and `ON DELETE SET NULL` for category references.

## Monetary Fields

| Table | Field | Type |
|-------|-------|------|
| `transactions` | `amount` | `numeric(14, 2)` |
| `investments` | `amount` | `numeric(14, 2)` |
| `investments` | `expected_return` | `numeric(14, 2)` |
| `investments` | `actual_return` | `numeric(14, 2)` |

All monetary fields use `numeric(14, 2)` for decimal-safe calculations.

## Constraints

- `transactions.amount > 0` — no zero or negative amounts
- `investments.amount > 0` — no zero or negative amounts
- `investments.expected_return >= 0` — no negative returns
- `investments.actual_return >= 0` — no negative returns
- `settings.theme IN ('light', 'dark', 'system')` — valid theme values
- `categories.type IN ('income', 'expense', 'investment')` — valid category types
- `transactions.type IN ('income', 'expense')` — valid transaction types
- `investments.status IN ('active', 'completed', 'cancelled', 'pending')` — valid statuses
- `settings.user_id UNIQUE` — one settings row per user
- `categories (user_id, name, type) UNIQUE` — no duplicate categories

## Indexes

| Index | Purpose |
|-------|---------|
| `idx_transactions_user_date` | Dashboard/reports date filtering |
| `idx_transactions_user_type` | Income/expense views |
| `idx_transactions_user_category` | Category filtering |
| `idx_transactions_user_exclude` | Profit calculation filtering |
| `idx_investments_user_date` | Investment date filtering |
| `idx_investments_user_status` | Investment status filtering |
| `idx_investments_user_exclude` | Profit calculation filtering |
| `idx_categories_user_type` | Category type filtering |
| `idx_settings_user` | Settings lookup |

## Security Weaknesses Reviewed

| Check | Status |
|-------|--------|
| RLS enabled on all user-owned tables | ✅ |
| No broad public policies | ✅ |
| Ownership derived from `auth.uid()` | ✅ |
| No service-role key in frontend | ✅ |
| No trust in browser-supplied `user_id` | ✅ |
| No RLS disabled to solve problems | ✅ |
| Monetary fields use decimal types | ✅ |
| Foreign keys enforce referential integrity | ✅ |
| NOT NULL constraints on required fields | ✅ |
| Check constraints prevent invalid values | ✅ |
| Indexes support common query patterns | ✅ |

## Conclusion

The database schema and RLS implementation satisfy the TDX security requirements. User data isolation is enforced at the database level, and no client-supplied ownership values are trusted.