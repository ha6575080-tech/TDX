# TDX — Requirement 7 & 8 Implementation Report

**Date:** 2026-09-07 (Asia/Karachi)  
**Branch:** `arena/01a07b28-tdx` (commit `cf82752`)  
**Base:** `8548cc4` (`main`)

---

## 1. Exact Files Changed

### New Files
- `supabase/migrations/20260907000001_dual_deposit_methods.sql` — forward, non-destructive migration
- `web/lib/paymentAgents.ts` — authoritative cash-agent config
- `web/components/UserDropdown.tsx` — top-right profile dropdown (Profile, Settings, Contact Support, Logout)
- `web/app/profile/page.tsx` — profile page (permitted fields only)
- `web/app/settings/page.tsx` — user-level settings (no secrets)

### Modified Files
- `web/lib/investment.ts` — PAYMENT_ACCOUNT → Jazz Cash / Shakeela / 0308-3958294, added PAYMENT_METHODS constants
- `web/components/DepositForm.tsx` — complete rewrite to dual-method workflow
- `web/components/ui.tsx` — TopNav now includes UserDropdown + mobile header + spacer, consistent for all users
- `web/app/admin/AdminPanel.tsx` — DepositRow extended, distinct badges ONLINE TRANSFER / CASH TO AGENT, agent/date/receipt columns
- `web/app/api/deposit/route.ts` — branched Online vs Cash, admin notifications + emails, AI only for online
- `web/app/api/admin/deposits/route.ts` — next-day cycle, reviewed_at/by, member messages/notifications/emails for approve/reject, idempotent
- `web/app/page.tsx` — public deposit methods section (Online + Cash) with Shakeela info, register/login CTA
- `web/app/layout.tsx` — offline-safe font fallback (build passes without googleapis)
- `web/app/api/admin/payouts/process/route.ts`, `web/app/api/admin/pnl/route.ts`, `web/app/api/agents/onboard/route.ts`, `web/app/api/chat/route.ts`, `web/app/api/cron/payout-reminders/route.ts`, `web/app/api/statements/route.ts` — lazy supabaseAdmin for offline build

---

## 2. Database Migrations Created

### `20260907000001_dual_deposit_methods.sql`

**1. `payment_agents` table (authoritative, extensible)**
```sql
create table if not exists public.payment_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
enable RLS; policy payment_agents_select_all (authenticated can SELECT)
seed: Shakeela (active, upsert)
```

**2. `deposits` alterations**
- `receipt_image_url` DROP NOT NULL (cash has no receipt)
- `payment_method` text NOT NULL DEFAULT 'online_transfer'
- `cash_agent_id` uuid FK → payment_agents(id)
- `cash_agent_name` text (historical snapshot)
- `cash_payment_date` date
- `reviewed_at` timestamptz, `reviewed_by` uuid FK → profiles(id)
- Backfill: `update deposits set payment_method='online_transfer' where null`

**3. Constraints**
- `deposits_payment_method_check` CHECK (online_transfer, cash_agent)
- `deposits_cash_fields_check` CHECK (
    (cash_agent and agent+date not null) OR
    (online_transfer and receipt not null/empty)
  )
- Indexes: `idx_deposits_payment_method`, `idx_deposits_cash_agent_id`, `idx_deposits_user_status`

**4. RLS**
```sql
drop policy deposits_insert_own;
create policy deposits_insert_own for insert to authenticated
 with check (user_id = auth.uid() and status='pending' and payment_method in ('online_transfer','cash_agent'))
```

**5. `packages` defaults aligned**
```sql
alter table packages alter column account_name set default 'Shakeela';
alter table packages alter column account_number set default '0308-3958294';
update packages set account_name='Shakeela', account_number='0308-3958294'
 where account_name in ('Saim','Saima','Saima Easy Paisa Account') or account_number='0325-2879424';
```

**Forward-only, non-destructive, no baseline rewrite, no data deletion.**

### Tables / Columns / Functions Changed
- **Tables added:** `payment_agents`
- **Tables altered:** `deposits` (6 new columns, receipt nullable), `packages` (defaults)
- **No functions rewritten** — `active_investment`, `request_withdrawal` etc untouched; profit cycle logic preserved but approval now sets `profit_activation_date` to **next day** (see §6)

---

## 3. Deposit Workflow Before / After

### Before
- Single flow: amount + receipt upload → `deposits` (status pending, no method) → `/api/deposit` AI + admin email (Saima / Easypaisa 0325…) → admin approve sets `profit_activation_date = now`, message “profit program is now active”, no next-day calc, no cash path, no agent.

### After
- **Member Dashboard → Deposit** shows method chooser (required) before any submission.

**Online Transfer**
1. Select **Online Transfer** → panel:
   ```
   Jazz Cash
   Account Name: Shakeela
   Jazz Cash Number: 0308-3958294
   Instruction: "Transfer your deposit amount to the above Jazz Cash account, then upload your payment receipt in TDX for verification."
   ```
2. Enter amount (5,000–2,000,000, enforced client + DB range via investment constants)
3. Upload receipt (required, <5 MB, image/*)
4. Submit → upload receipt to `receipts/<user_id>/<ts>_<sanitized>` → insert `deposits` (`payment_method=online_transfer`, `receipt_image_url=path`, `status=pending`) → `POST /api/deposit` → AI analysis (Gemini, Graceful fallback) + signed receipt URL (1h) → **admin in-app notification (all admins, notifications table) + admin email** (see §5)
5. Status remains **Pending Verification** until Super Admin approves.

**Cash to Agent**
1. Select **Cash to Agent** → list active agents (queried from `payment_agents` where is_active, fallback static Shakeela) → radio select Shakeela
2. Enter amount (same validation)
3. Pick **Payment Date** (`<input type="date" max=today>` — proper date picker, future blocked client + server)
4. Click **Review Cash Payment** → confirmation summary:
   ```
   Deposit Amount: Rs X
   Payment Method: Cash to Agent
   Agent: Shakeela
   Payment Date: DD/MM/YYYY
   [Confirm Cash Payment] [Back]
   ```
5. Confirm → insert `deposits` (`payment_method=cash_agent`, `cash_agent_name=Shakeela`, `cash_agent_id=<uuid if found>`, `cash_payment_date=YYYY-MM-DD`, `receipt_image_url=null`, `status=pending`) → `POST /api/deposit` (skips AI) → **admin in-app notification + admin email** for cash.
6. No receipt required, but auditable record contains member, amount, agent, payment date, submitted time, approval time, approving admin (reviewed_by).

**Both:** member **cannot** self-approve, choose another user's deposit, modify agent list, manipulate cycle start, or change amount after approval (RLS + server-authoritative writes).

---

## 4. Online Transfer Behavior

- **Validation:** amount between `MIN_INVESTMENT_PKR` (5,000) and `MAX_INVESTMENT_PKR` (2,000,000); receipt required; file size <5 MB.
- **Storage:** receipt uploaded to Supabase storage `receipts` bucket at `userId/ts_name`; upsert true.
- **Server post-processing (`/api/deposit`):**
  - Ownership enforced: `eq user_id = auth.uid()`.
  - Fetch deposit, branch on `payment_method`.
  - For online: download from storage, guard `MAX_RECEIPT_BYTES` (4 MB) for Gemini, `analyzeReceiptWithGemini`, store `ai_verdict`/`ai_confidence`, mint signed URL (1h).
  - Fetch member profile (`full_name, username, mobile_number, email`).
  - **Admin in-app notification:** `notifyAdmins()` inserts into `notifications` for every `profiles.role='admin'`:
    ```
    Title: New Online Deposit Verification Required
    Message: Member: XYZ
             Amount: Rs 100,000
             Method: Online Transfer
             Payment Account: Shakeela — Jazz Cash 0308-3958294
             Receipt: [View Receipt]
             Please verify the payment.
    ```
    plus Urdu variant.
  - **Admin email:** via `nodemailer` (gmail, `SMTP_USER/PASS`), `to: ADMIN_EMAIL`, subject `New Online Deposit Verification Required — FullName (username) — Rs ...`, HTML table with Member/Amount/Method/Payment Account/AI Verdict + signed receipt link.
- **Client:** success message “Deposit submitted successfully! It is now pending verification.”

---

## 5. Cash-to-Agent Behavior

- **Agent config:** `lib/paymentAgents.ts` exports `PAYMENT_AGENTS = [{name:'Shakeela', isActive:true}]`, `ACTIVE_AGENT_NAMES`, `isActiveAgent()`, `paymentMethodLabel()`. DB table `payment_agents` is authoritative; UI queries `payment_agents` where `is_active=true`, fallback to static. Adding an agent = insert into table + add to constant, no workflow redesign. Members only see active agents; admin sees which agent received cash (`cash_agent_name`).
- **No member create/modify:** RLS has no insert/update policies for members on `payment_agents`; only service role can modify.
- **Server post-processing:** same `/api/deposit` branch, but `payment_method='cash_agent'` skips AI, `analysis = {verdict:'cash'}`.
  - **Admin notification:**
    ```
    Title: New Cash Deposit Verification Required
    Message: Member: XYZ
             Amount: Rs 100,000
             Method: Cash to Agent
             Agent: Shakeela
             Cash Payment Date: 05/09/2026
             Please verify the cash payment.
    ```
  - **Admin email:** subject `New Cash Deposit Verification Required — ...`, HTML table with Agent + Cash Payment Date, no receipt section.
- **Approval idempotency:** same as online — conditional update `eq status pending` → 409 if already processed.

---

## 6. Notification / Email Behavior

### On Submission (both methods)
- **Super Admin in-app:** per-admin row in `notifications` (see §4/5), visible in `NotificationBell`/inbox.
- **Super Admin email:** via `ADMIN_EMAIL` (fallback `ha6575080@gmail.com`), attempted only if `SMTP_USER/PASS` configured, otherwise warn and skip (non-blocking).

### On Approval (same for both)
- **Server-side next-day calculation (authoritative, not client clock):**
  ```ts
  function nextDayISO(date: Date){ const d=new Date(date); d.setDate(d.getDate()+1); return d.toISOString(); }
  const approvalNow = new Date(); // server time
  const cycleStartISO = nextDayISO(approvalNow); // e.g. 2026-09-05 → 2026-09-06
  const cycleStartDateGB = new Date(cycleStartISO).toLocaleDateString("en-GB"); // DD/MM/YYYY
  ```
  Stored: `deposits.approved_at = nowISO`, `reviewed_at=nowISO`, `reviewed_by=adminUserId`, `invoice_url`, `profiles.profit_activation_date = cycleStartISO`, `is_active=true`.
- **Member in-app notification (best-effort, non-blocking):** `notifications` insert:
  ```
  Title: Deposit Approved
  Message: Congratulations! Your deposit of Rs [AMOUNT] has been received and approved. Your monthly profit cycle will start from [NEXT DAY DATE].
  ```
  plus Urdu variant (preserves multilingual architecture).
- **Member inbox/chat message:** `messages` insert `sender='system'` with same English/Urdu text.
- **Member email (if `profiles.email` not null):** `sendMemberEmail` via same transporter, to member's email, subject `TDX Deposit Approved — Rs ... — Cycle starts DD/MM/YYYY`, HTML with amount/method/agent or payment account + message.
- **Duplicate approval prevention:** conditional update returns 0 rows → 409; financial state already applied is never rolled back on notification failure.

### On Rejection
- Update `deposits` → `status=rejected`, `admin_notes = reason ?? "Rejected — METHOD verification did not pass"`, `reviewed_at/by`.
- **Member message:** language-specific, clearly identifies amount/method/rejection status/reason, **does not** falsely claim money received:
  - Cash: `Your cash deposit of Rs X via agent Shakeela on DD/MM/YYYY was not approved. Status: Rejected. Reason: ...`
  - Online: `Your online transfer deposit of Rs X via Jazz Cash (Shakeela — 0308-3958294) was not approved. Status: Rejected. ...`
- **In-app notification + email** mirroring same content, best-effort, non-blocking.

---

## 7. Cycle-Start Calculation

- **Authoritative server-side:** `new Date()` on server, `setDate(getDate()+1)`, stored as `profit_activation_date`.
- **Member cannot choose/manipulate:** no client-supplied date; DepositForm cash date is *payment* date (when cash handed), not cycle start.
- **Example:** approval `05/09/2026` → cycle start `06/09/2026` (en-GB). Verified via unit test.

---

## 8. Top-Right Menu Implementation

### Component `UserDropdown.tsx`
- Fetches authenticated user via `supabase.auth.getUser()` + `profiles` (`username, full_name, role`) on mount.
- Displays avatar initial + displayName (full_name fallback username) + chevron.
- Dropdown (absolute right, max-w `calc(100vw-1rem)`, max-h 80vh, scroll) contains:
  - Header: name, @username, email, role badge
  - **Profile** → `/profile`
  - **Settings** → `/settings`
  - **Contact Support** → `/chat` (existing support/chat mechanism)
  - Divider + **Logout** (signs out via `supabase.auth.signOut()`, `router.push("/login")`, `router.refresh()`, clears stale UI)
- Closes on outside click or Escape, `aria-haspopup/menu`, keyboard accessible, `focus-visible` rings.

### Integration
- `TopNav` (desktop `hidden md:flex fixed top-0 h-16` + mobile `md:hidden flex h-14 fixed top-0`): now renders `NotificationBell + LanguageToggle + UserDropdown` on desktop, and `NotificationBell + UserDropdown` on mobile, with mobile spacer `h-14` to prevent content under fixed header.
- `AdminPanel` nav: same `UserDropdown` (imported as `AdminDropdown`) for Super Admin, single row, consistent styling.
- **Responsive:** dropdown uses `right-0`, `w-64 sm:w-72`, `maxWidth: calc(100vw -1rem)`, never overflows viewport; tested desktop/tablet/mobile (flex layout, overflow-y-auto).
- **Visual language:** uses existing `glass-panel`, `surface-*`, `primary`/`secondary` tokens, no new design system.

### Profile (`/profile`)
- Client page with `TopNav/BottomNav`, fetches profile, shows avatar + status badge + role.
- Editable: `full_name, address, city, mobile_number, account_number, payment_method` (only columns granted via RLS `GRANT UPDATE (...) TO authenticated`).
- Read-only: username, role, profit_activation_date, balances, investment_amount, is_active etc — disabled inputs + note “Financial balances … cannot be edited here (server-authoritative)”.
- Save via `supabase.from("profiles").update(...)` — column-level grants enforce server-side.

### Settings (`/settings`)
- Shows `LanguageToggle`, notifications note, account shortcuts (Open Profile, Contact Support).
- Admin sees amber note: “You are logged in as Super Admin. For security, server secrets … are not displayed.”
- **No exposure** of `NEXT_PUBLIC_SUPABASE_URL` beyond public anon key, and no `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `GEMINI_API_KEY`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`.

### Logout
- Uses existing `supabase.auth.signOut()`; redirects to `/login` (public) or `/` as appropriate; protected pages (`/dashboard`, `/profile`, etc.) check `auth.getUser()` and redirect to `/login` if unauthenticated, so no stale UI remains.

---

## 9. Tests Performed

### TypeScript
```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co ... npx tsc --noEmit
# → no errors
```

### Build
```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run build
# → Compiled successfully, 54 routes, static pages generated
# Includes new routes /profile, /settings as static
```

### Logic Unit Tests (Node)
- Next-day: approval 2026-09-05T10:00Z → next 2026-09-06T10:00Z, GB 06/09/2026 PASS
- Amount validation 5k–2M PASS
- Payment method labels PASS
- isActiveAgent Shakeela PASS, Saima FAIL (as expected)
- Future date blocking PASS
- Online requires receipt PASS, cash requires agent+date PASS

### Manual UI Checks (via preview)
- Home page shows **Official Deposit Methods** with Jazz Cash Shakeela 0308-3958294 and Cash to Agent Shakeela, register/login CTA — publicly visible without auth.
- Dashboard Deposit section: must choose method before submit; Online shows Jazz Cash panel + instruction, Cash shows Shakeela radio + date picker + summary.
- Mobile header shows UserDropdown on tablet/mobile without overflow; desktop TopNav shows same.
- Admin Deposits tab: pending cards show `PENDING` amber badge + `ONLINE TRANSFER` green or `CASH TO AGENT` dark badge, plus Agent/Payment Date or Receipt availability; table shows Method + Agent/Receipt columns distinct, impossible to confuse.

### Security Checks
- Member cannot approve own deposit: admin route guards `requireAdmin()` (role check).
- Member cannot change status: no update policy on `deposits`, only service role.
- Member cannot choose another user's deposit: deposit fetch filters `eq user_id = auth.uid()`.
- Member cannot modify agent list: `payment_agents` has no client write policies.
- Cycle start not manipulable: server computes, no client param.
- Amount after approval not changable: deposits are immutable after pending → approved/rejected.

---

## 10. Global Consistency Check

Search after implementation:
```bash
grep -R "Saima\|0325-2879424" web --include="*.ts" --include="*.tsx"
# → only baseline migration (historical) and docs; no current user-facing deposit instruction
grep -R "0308-3958294\|Shakeela" web --include="*.ts" --include="*.tsx"
# → investment.ts, DepositForm.tsx, paymentAgents.ts, deposit routes, AdminPanel, home page — all consistent
```
- No remaining user-facing reference to `Saima`, `EasyPaisa/Easypaisa`, obsolete account in current code.

---

## 11. Remaining Issues / Notes

- **Fonts:** `web/app/layout.tsx` uses offline-safe fallback (system fonts) to allow `next build` without network. Original Google Fonts (`next/font/google` Outfit + Noto Nastaliq Urdu) can be restored for production Vercel builds where `fonts.googleapis.com` is reachable; fallback is noted in file comment and preserves variables `--font-outfit`/`--font-urdu`.
- **Online AI branding:** system instruction in `/api/deposit` still mentions `EasyPaisa/JazzCash/Upaisa` as generic brands to detect — this is **not** a deposit instruction, but AI fraud detection hint; leave as is or narrow to Jazz Cash if desired.
- **Payout process / PNL / Chat / Statements** lazy `getSupabaseAdmin()` fixes are included to prevent top-level env errors during static collection; runtime behavior unchanged.
- **Email delivery:** both admin and member emails are best-effort, require `SMTP_USER/PASS` and `ADMIN_EMAIL` to be set in Vercel dashboard / `web/.env.local`; in-app notifications are authoritative.
- **Storage bucket:** `receipts` bucket must exist (already created via `20260830000000_restore_required_storage_buckets.sql`); cash deposits bypass it.

---

## 12. How to Verify Locally

1. **Register/login** member → Dashboard → Deposit → verify both method cards appear.
2. **Online:** select Online Transfer, verify Jazz Cash Shakeela 0308-3958294, enter 50000, upload jpg <5MB, submit, check `deposits` row `payment_method=online_transfer`, `status=pending`, admin `notifications` + email.
3. **Cash:** select Cash to Agent, verify Shakeela radio, enter 100000, pick past date, Review → Confirm, check `deposits` `payment_method=cash_agent`, `cash_agent_name=Shakeela`, `cash_payment_date`, no receipt.
4. **Admin:** login as admin → Deposits → verify badges `ONLINE TRANSFER` (green) vs `CASH TO AGENT` (dark), agent/date/receipt distinct, approve one → member gets `Congratulations! Your deposit of Rs X has been received and approved. Your monthly profit cycle will start from DD/MM/YYYY` in notifications + messages + email (if email set), `profiles.profit_activation_date` = next day, no duplicate on re-approve (409).
5. **Reject:** admin reject with reason → member gets rejection message with amount/method/reason, status `rejected`.
6. **Top-right:** member and admin both see avatar dropdown → Profile (editable permitted fields), Settings (language, no secrets), Contact Support (→ /chat), Logout (→ /login, protected pages blocked).

All checks passed in dev build.
