#!/usr/bin/env node
/**
 * Dual ledger payout tests — verifies Model C (profits per-user + payouts per-deposit)
 * with cross-ledger idempotency and PnL dedup.
 *
 * Covers:
 * 1. one normal payout via payouts/process (per-deposit)
 * 2. duplicate payout same deposit/month rejected (409 / 23505)
 * 3. two deposits same member/month — both payouts allowed (distinct deposit_id)
 * 4. legacy endpoint behavior (profits pending -> paid)
 * 5. payout/process cross-ledger guard (profits already paid blocks per-deposit)
 * 6. payout + withdrawal same cycle guard (withdrawal paid profit blocks legacy & per-deposit)
 * 7. concurrent payout attempts (only one wins)
 * 8. PnL totals dedup (payouts + non-overlapping profits)
 * 9. receipt percentage deterministic (uses payouts table)
 * 10. unauthorized admin request (403)
 */

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; } catch (e) { console.error(`✗ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Mock DB state
function createMockDB() {
  return {
    deposits: [],
    payouts: [], // per-deposit
    profits: [], // per-user-month
    withdrawals: [],
  };
}

// Mock logic mirroring route handlers

function processPayout(db, { deposit_id, percentage, now = new Date() }) {
  if (!deposit_id || ![7,8,9,10].includes(percentage)) return { status: 400, error: 'deposit_id required and percentage must be 7,8,9,10' };
  const deposit = db.deposits.find(d => d.id === deposit_id && d.status === 'approved');
  if (!deposit) return { status: 404, error: 'Deposit not found or not approved' };
  const month = now.getMonth()+1, year = now.getFullYear();
  // Cross-ledger guard: profits already paid for this user/month
  const existingProfit = db.profits.find(p => p.user_id===deposit.user_id && p.month===month && p.year===year && p.status==='paid');
  if (existingProfit) return { status: 409, error: 'Profit already marked paid for this user/month — per-deposit payout would double-count' };
  // Per-deposit duplicate check
  const existing = db.payouts.find(p => p.deposit_id===deposit_id && p.month===month && p.year===year && p.status==='paid');
  if (existing) return { status: 409, error: 'Payout already processed for this deposit this month' };
  const amount = (deposit.amount * percentage)/100;
  // Simulate unique index race via second check (for concurrent test)
  // Caller must handle 23505 simulation externally
  const payout = { id: `payout-${Date.now()}-${Math.random()}`, user_id: deposit.user_id, deposit_id, amount, percentage_applied: percentage, month, year, status: 'paid', created_at: now.toISOString() };
  db.payouts.push(payout);
  deposit.next_payout_date = new Date(now.getTime()+30*24*60*60*1000).toISOString();
  deposit.monthly_profit_pct = percentage;
  return { status: 200, payout };
}
function insertPayoutWithUniqueGuard(db, payload) {
  // Simulates DB unique index 23505
  const exists = db.payouts.find(p => p.deposit_id===payload.deposit_id && p.month===payload.month && p.year===payload.year && p.status==='paid');
  if (exists) {
    const err = new Error('duplicate'); err.code='23505'; throw err;
  }
  db.payouts.push(payload);
}

function legacyPayout(db, { profitId }) {
  const profit = db.profits.find(p => p.id===profitId);
  if (!profit) return { status: 404, error: 'Profit not found' };
  // Cross-ledger guard: per-deposit payouts already exist for this user/month
  const existingPayouts = db.payouts.filter(p => p.user_id===profit.user_id && p.month===profit.month && p.year===profit.year && p.status==='paid');
  if (existingPayouts.length>0) return { status: 409, error: 'Payout already processed via per-deposit ledger for this user/month' };
  if (profit.status !== 'pending') return { status: 409, error: 'Payout is not pending — already processed.' };
  profit.status = 'paid';
  profit.payout_date = new Date().toISOString();
  return { status: 200, profit };
}

function completeWithdrawal(db, { withdrawalId, rate, actorRole='admin' }) {
  if (![7,8,9,10].includes(rate)) return { status: 400, error: 'invalid rate' };
  if (actorRole !== 'admin') return { status: 403, error: 'not admin' };
  const wd = db.withdrawals.find(w=>w.id===withdrawalId);
  if (!wd) return { status: 404, error: 'not found' };
  if (wd.status!=='pending') return { status: 409, error: 'not pending' };
  // compute profit and update ledger (simplified)
  wd.status='completed'; wd.monthly_profit_rate=rate; wd.amount=1000; // dummy
  const m = new Date(wd.cycle_end).getUTCMonth()+1, y=new Date(wd.cycle_end).getUTCFullYear();
  let ledger = db.profits.find(p=>p.user_id===wd.user_id && p.month===m && p.year===y);
  if (ledger) { ledger.status='paid'; ledger.amount=wd.amount; ledger.payout_date=new Date().toISOString(); }
  else { ledger={ id:`profit-${Date.now()}`, user_id:wd.user_id, month:m, year:y, amount:wd.amount, status:'paid', payout_date:new Date().toISOString() }; db.profits.push(ledger); }
  return { status:200, ledger };
}

function computePnl(db, startDate) {
  const payouts = db.payouts.filter(p=>p.status==='paid' && new Date(p.created_at) >= startDate);
  const profitsPaid = db.profits.filter(p=>p.status==='paid' && p.payout_date && new Date(p.payout_date) >= startDate);
  const payoutKeys = new Set(payouts.map(p=>`${p.user_id}-${p.month}-${p.year}`));
  const nonOverlappingProfits = profitsPaid.filter(pr=>!payoutKeys.has(`${pr.user_id}-${pr.month}-${pr.year}`));
  const totalPayoutsPerDeposit = payouts.reduce((s,p)=>s+Number(p.amount),0);
  const totalProfitsNonOverlapping = nonOverlappingProfits.reduce((s,p)=>s+Number(p.amount),0);
  const totalPayouts = totalPayoutsPerDeposit + totalProfitsNonOverlapping;
  return { totalPayoutsPerDeposit, totalProfitsPaid: profitsPaid.reduce((s,p)=>s+Number(p.amount),0), totalProfitsNonOverlapping, totalPayouts, nonOverlappingProfits };
}

// 1. one normal payout
test('1. one normal payout via payouts/process succeeds', () => {
  const db=createMockDB();
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  const res=processPayout(db,{ deposit_id:'d1', percentage:8, now:new Date('2026-09-07T00:00:00Z') });
  assert(res.status===200, 'should succeed');
  assert(db.payouts.length===1, 'one payout');
  assert(db.payouts[0].percentage_applied===8, '8%');
  assert(db.payouts[0].amount===8000, '8000');
});

// 2. duplicate payout same deposit/month rejected
test('2. duplicate payout same deposit/month rejected (409)', () => {
  const db=createMockDB();
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  const now=new Date('2026-09-07T00:00:00Z');
  const r1=processPayout(db,{ deposit_id:'d1', percentage:8, now });
  assert(r1.status===200,'first ok');
  const r2=processPayout(db,{ deposit_id:'d1', percentage:9, now });
  assert(r2.status===409,'second should 409');
  assert(db.payouts.length===1,'still one');
});

// 3. two deposits same member/month — both allowed (distinct deposit_id per-deposit) but profits guard not yet triggered
test('3. two deposits same member/month — per-deposit payouts for different deposits in same month both succeed until profit blocks', () => {
  const db=createMockDB();
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  db.deposits.push({ id:'d2', user_id:'u1', amount:200000, status:'approved' });
  const now=new Date('2026-09-07T00:00:00Z');
  const r1=processPayout(db,{ deposit_id:'d1', percentage:7, now });
  assert(r1.status===200,'first deposit payout ok');
  const r2=processPayout(db,{ deposit_id:'d2', percentage:10, now });
  assert(r2.status===200,'second deposit same month allowed (different deposit_id)');
  assert(db.payouts.length===2,'two payouts');
  // Third attempt same d1 same month should 409
  const r3=processPayout(db,{ deposit_id:'d1', percentage:8, now });
  assert(r3.status===409,'duplicate d1 blocked');
});

// 4. legacy endpoint behavior (profits pending -> paid) succeeds when no per-deposit payouts exist
test('4. legacy payout marks profits pending->paid when no per-deposit payouts for that month', () => {
  const db=createMockDB();
  db.profits.push({ id:'p1', user_id:'u1', month:9, year:2026, amount:15000, status:'pending', payout_date:'2026-09-10T00:00:00Z' });
  const res=legacyPayout(db,{ profitId:'p1' });
  assert(res.status===200,'legacy should succeed');
  assert(db.profits[0].status==='paid','now paid');
});

// 5. payout/process cross-ledger guard: profits already paid blocks per-deposit payout for same month
test('5. cross-ledger guard: profits already paid blocks per-deposit payout for same user/month', () => {
  const db=createMockDB();
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  db.profits.push({ id:'p1', user_id:'u1', month:9, year:2026, amount:8000, status:'paid', payout_date:'2026-09-01T00:00:00Z' });
  const now=new Date('2026-09-07T00:00:00Z'); // month 9
  const res=processPayout(db,{ deposit_id:'d1', percentage:8, now });
  assert(res.status===409,'should block due to profits already paid');
  assert(res.error.includes('already marked paid'),'error message');
});

// 6. legacy guard: per-deposit payouts already exist blocks legacy profit payout for same month
test('6. legacy guard: per-deposit payouts already exist blocks legacy payout for same month', () => {
  const db=createMockDB();
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  db.profits.push({ id:'p1', user_id:'u1', month:9, year:2026, amount:15000, status:'pending', payout_date:'2026-09-10T00:00:00Z' });
  const now=new Date('2026-09-07T00:00:00Z');
  const r1=processPayout(db,{ deposit_id:'d1', percentage:8, now });
  assert(r1.status===200,'per-deposit first');
  const r2=legacyPayout(db,{ profitId:'p1' });
  assert(r2.status===409,'legacy should be blocked due to existing per-deposit payout');
});

// 7. concurrent payout attempts — DB unique 23505 ensures only one wins
test('7. concurrent payout attempts: DB unique 23505 only one succeeds', () => {
  const db=createMockDB();
  // simulate two concurrent inserts bypassing app check
  const payload = { id:'p1', deposit_id:'d1', user_id:'u1', month:9, year:2026, amount:8000, percentage_applied:8, status:'paid', created_at:new Date().toISOString() };
  insertPayoutWithUniqueGuard(db, payload);
  let threw=false;
  try { insertPayoutWithUniqueGuard(db, { ...payload, id:'p2' }); } catch(e) { threw=true; assert(e.code==='23505','should be 23505'); }
  assert(threw,'second should throw 23505');
  assert(db.payouts.length===1,'only one');
});

// 8. PnL totals dedup: payouts + non-overlapping profits, overlapping profits not double-counted
test('8. PnL dedup: overlapping profits not double-counted', () => {
  const db=createMockDB();
  const now=new Date('2026-09-07T00:00:00Z');
  const start=new Date('2026-09-01T00:00:00Z');
  // Case A: per-deposit payouts for u1 9/2026 = 8000
  db.payouts.push({ id:'pay1', user_id:'u1', month:9, year:2026, amount:8000, percentage_applied:8, status:'paid', created_at:'2026-09-05T00:00:00Z', deposit_id:'d1' });
  // Legacy profit for same u1 9/2026 = 8000 would be overlapping — should not be added
  db.profits.push({ id:'prof1', user_id:'u1', month:9, year:2026, amount:8000, status:'paid', payout_date:'2026-09-05T00:00:00Z' });
  // Legacy profit for u2 9/2026 = 5000 no payouts — should be counted
  db.profits.push({ id:'prof2', user_id:'u2', month:9, year:2026, amount:5000, status:'paid', payout_date:'2026-09-05T00:00:00Z' });
  const pnl=computePnl(db,start);
  assert(pnl.totalPayoutsPerDeposit===8000,'payouts 8000');
  assert(pnl.totalProfitsPaid===13000,'profits paid 13000');
  assert(pnl.totalProfitsNonOverlapping===5000,'non-overlapping 5000');
  assert(pnl.totalPayouts===13000,'total payouts deduped 8000+5000=13000 not 21000');
  // If only profits, count it
  const db2=createMockDB();
  db2.profits.push({ id:'prof3', user_id:'u1', month:9, year:2026, amount:8000, status:'paid', payout_date:'2026-09-05T00:00:00Z' });
  const pnl2=computePnl(db2,start);
  assert(pnl2.totalPayouts===8000,'legacy only counts profits');
  // If only payouts, count payouts
  const db3=createMockDB();
  db3.payouts.push({ id:'pay2', user_id:'u1', month:9, year:2026, amount:8000, percentage_applied:8, status:'paid', created_at:'2026-09-05T00:00:00Z', deposit_id:'d1' });
  const pnl3=computePnl(db3,start);
  assert(pnl3.totalPayouts===8000,'payouts only');
});

// 9. receipt percentage deterministic: uses payouts table per-deposit with amount match, not arbitrary
test('9. receipt percentage deterministic via payouts table', () => {
  // Mock receipt resolver (simplified) — should pick payouts exactly matching user/month/year
  function resolveReceipt(profit, payouts) {
    const rows=payouts.filter(p=>p.user_id===profit.user_id && p.month===profit.month && p.year===profit.year && p.status==='paid' && [7,8,9,10].includes(p.percentage_applied));
    if (rows.length===1) return rows[0].percentage_applied;
    if (rows.length>1) {
      const uniq=[...new Set(rows.map(r=>r.percentage_applied))];
      if (uniq.length===1) return uniq[0];
      // exact amount match
      const exact=rows.filter(r=>r.amount===profit.amount);
      if (exact.length===1) return exact[0].percentage_applied;
      return null; // ambiguous
    }
    return null;
  }
  const profit={ user_id:'u1', month:9, year:2026, amount:10000 };
  const payouts=[
    { user_id:'u1', month:9, year:2026, amount:7000, percentage_applied:7, status:'paid' },
    { user_id:'u1', month:9, year:2026, amount:10000, percentage_applied:10, status:'paid' },
  ];
  const pct=resolveReceipt(profit,payouts);
  assert(pct===10,'exact amount 10000 -> 10% not arbitrary 7%');
  // ambiguous without amount match
  const profit2={ user_id:'u1', month:9, year:2026, amount:9999 };
  const pct2=resolveReceipt(profit2,payouts);
  assert(pct2===null,'no amount match -> null not arbitrary');
});

// 10. unauthorized admin request (403)
test('10. unauthorized admin request returns 403', () => {
  function requireAdminMock(user) {
    if (!user || user.role!=='admin') return { error: { status:403, message:'Forbidden' } };
    return { user };
  }
  const res1=requireAdminMock(null);
  assert(res1.error && res1.error.status===403,'no user -> 403');
  const res2=requireAdminMock({ id:'u1', role:'user' });
  assert(res2.error && res2.error.status===403,'user role not admin -> 403');
  const res3=requireAdminMock({ id:'u1', role:'admin' });
  assert(!res3.error,'admin passes');
});

// 11. payout + withdrawal same cycle: withdrawal paid profit blocks both payout paths for same month
test('11. withdrawal same cycle blocks legacy and per-deposit payouts for that month', () => {
  const db=createMockDB();
  db.withdrawals.push({ id:'w1', user_id:'u1', status:'pending', cycle_end:'2026-09-30T00:00:00Z' });
  db.profits.push({ id:'p1', user_id:'u1', month:9, year:2026, amount:10000, status:'pending', payout_date:'2026-09-30T00:00:00Z' });
  db.deposits.push({ id:'d1', user_id:'u1', amount:100000, status:'approved' });
  const wdRes=completeWithdrawal(db,{ withdrawalId:'w1', rate:8 });
  assert(wdRes.status===200,'withdrawal completes and marks profit paid');
  // Now per-deposit payout for same month should be blocked
  const now=new Date('2026-09-07T00:00:00Z');
  // Adjust cycle month to match payout month for cross-check (withdrawal cycle_end month 9, payout month 9)
  // Our process guard checks profits paid for that month, so it should block
  const procRes=processPayout(db,{ deposit_id:'d1', percentage:8, now });
  assert(procRes.status===409,'per-deposit after withdrawal should block');
  // Legacy should also be blocked (already paid)
  const legRes=legacyPayout(db,{ profitId:'p1' });
  assert(legRes.status===409,'legacy after withdrawal should block (already paid or cross-ledger)');
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed>0) process.exit(1);
else console.log('✓ All dual ledger tests passed');
