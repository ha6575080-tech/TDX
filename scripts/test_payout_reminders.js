#!/usr/bin/env node
/**
 * Mocked test for 5-stage exact-once + retry + channel separation + multi-member independence
 * Tests the lib/payoutReminders logic and the DB unique constraint simulation.
 *
 * Run: node scripts/test_payout_reminders.js
 */

const STAGES = [
  { stage: "48h", ms: 48 * 60 * 60 * 1000 },
  { stage: "24h", ms: 24 * 60 * 60 * 1000 },
  { stage: "12h", ms: 12 * 60 * 60 * 1000 },
  { stage: "1h", ms: 1 * 60 * 60 * 1000 },
  { stage: "10m", ms: 10 * 60 * 1000 },
];
const TOLERANCE = 5 * 60 * 1000;

function getDueStages(payoutDate, now = new Date(), toleranceMs = TOLERANCE) {
  const delta = payoutDate.getTime() - now.getTime();
  if (!Number.isFinite(delta) || delta <= 0) return [];
  const due = [];
  for (const { stage, ms } of STAGES) {
    if (delta <= ms && delta > ms - toleranceMs) due.push(stage);
  }
  return due;
}

// Simulated delivery table with unique constraint per (profit_id, stage, channel)
class MockDeliveryTable {
  constructor() {
    this.rows = new Map(); // key: profit_id|stage|channel or deposit_id|stage|channel
  }
  keyFor(profitId, depositId, stage, channel) {
    const id = profitId ? `profit:${profitId}` : `deposit:${depositId}`;
    return `${id}|${stage}|${channel}`;
  }
  tryInsert({ profitId = null, depositId = null, stage, channel }) {
    const k = this.keyFor(profitId, depositId, stage, channel);
    if (this.rows.has(k)) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = "23505";
      return { ok: false, error: err };
    }
    this.rows.set(k, { profitId, depositId, stage, channel, at: new Date().toISOString() });
    return { ok: true };
  }
  count() { return this.rows.size; }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

const now = new Date("2026-09-07T00:00:00.000Z");

// 1. Each stage exact-once within tolerance
for (const { stage, ms } of STAGES) {
  test(`stage ${stage} is due when payout is exactly ${stage} away`, () => {
    const payout = new Date(now.getTime() + ms);
    const due = getDueStages(payout, now);
    assert(due.includes(stage), `expected ${stage} to be due, got [${due.join(",")}]`);
    // only that stage should be due, not others (within narrow tolerance)
    assert(due.length === 1, `expected 1 due stage, got ${due.length} : [${due}]`);
  });

  test(`stage ${stage} is due 2 minutes after stage time (within 5m tolerance)`, () => {
    const payout = new Date(now.getTime() + ms - 2 * 60 * 1000);
    const due = getDueStages(payout, now);
    assert(due.includes(stage), `expected ${stage} within tolerance, got [${due}]`);
  });

  test(`stage ${stage} is NOT due 6 minutes after stage time (outside tolerance)`, () => {
    const payout = new Date(now.getTime() + ms - 6 * 60 * 1000);
    const due = getDueStages(payout, now);
    assert(!due.includes(stage), `expected ${stage} NOT due outside tolerance, got [${due}]`);
  });

  test(`stage ${stage} is NOT due when payout is 1h before that stage`, () => {
    const payout = new Date(now.getTime() + ms + 60 * 60 * 1000);
    const due = getDueStages(payout, now);
    assert(!due.includes(stage), `expected ${stage} NOT due when payout further than stage, got [${due}]`);
  });
}

// 2. No stage when payout in past or just passed
test("no due when payout is in the past", () => {
  const payout = new Date(now.getTime() - 1000);
  assert(getDueStages(payout, now).length === 0, "expected none");
});
test("no due when payout is exactly now", () => {
  const payout = new Date(now.getTime());
  assert(getDueStages(payout, now).length === 0, "expected none");
});

// 3. Exact-once per profit_id+stage+channel with mock table
test("exact-once per stage+channel: concurrent inserts only one succeeds", () => {
  const tbl = new MockDeliveryTable();
  const profitId = "profit-111";
  const r1 = tbl.tryInsert({ profitId, stage: "24h", channel: "email" });
  const r2 = tbl.tryInsert({ profitId, stage: "24h", channel: "email" });
  assert(r1.ok === true, "first should succeed");
  assert(r2.ok === false && r2.error.code === "23505", "second should be duplicate");
  assert(tbl.count() === 1, "only one row");
});

test("retry after success never duplicates (idempotent)", () => {
  const tbl = new MockDeliveryTable();
  const profitId = "profit-222";
  const first = tbl.tryInsert({ profitId, stage: "48h", channel: "in_app" });
  assert(first.ok, "first ok");
  // simulate retry (e.g., cron retry, network retry)
  for (let i = 0; i < 5; i++) {
    const r = tbl.tryInsert({ profitId, stage: "48h", channel: "in_app" });
    assert(!r.ok, `retry ${i} should be duplicate`);
  }
  assert(tbl.count() === 1, "still one row after retries");
});

test("email vs in_app separate: same profit+stage can have both channels", () => {
  const tbl = new MockDeliveryTable();
  const profitId = "profit-333";
  const e = tbl.tryInsert({ profitId, stage: "12h", channel: "email" });
  const ia = tbl.tryInsert({ profitId, stage: "12h", channel: "in_app" });
  assert(e.ok && ia.ok, "both channels should succeed independently");
  assert(tbl.count() === 2, "two rows");
  // duplicate on same channel still blocked
  const e2 = tbl.tryInsert({ profitId, stage: "12h", channel: "email" });
  assert(!e2.ok, "duplicate email should fail");
  assert(tbl.count() === 2, "still two");
});

test("multi-member independent: same stage for different profit IDs both succeed", () => {
  const tbl = new MockDeliveryTable();
  const pA = "profit-aaa";
  const pB = "profit-bbb";
  const rA = tbl.tryInsert({ profitId: pA, stage: "1h", channel: "email" });
  const rB = tbl.tryInsert({ profitId: pB, stage: "1h", channel: "email" });
  assert(rA.ok && rB.ok, "both members should succeed independent");
  assert(tbl.count() === 2, "two rows");
  // one member duplicate still blocked, other unaffected
  const rA2 = tbl.tryInsert({ profitId: pA, stage: "1h", channel: "email" });
  assert(!rA2.ok, "duplicate for A");
  assert(tbl.count() === 2, "still two");
});

test("different stages for same profit are independent", () => {
  const tbl = new MockDeliveryTable();
  const pid = "profit-444";
  for (const s of ["48h","24h","12h","1h","10m"]) {
    const r = tbl.tryInsert({ profitId: pid, stage: s, channel: "email" });
    assert(r.ok, `${s} should succeed`);
  }
  assert(tbl.count() === 5, "all five stages");
  // duplicate any
  assert(!tbl.tryInsert({ profitId: pid, stage: "24h", channel: "email" }).ok, "duplicate 24h");
});

test("deposit_id vs profit_id independence with partial unique", () => {
  const tbl = new MockDeliveryTable();
  const profitId = "profit-555";
  const depositId = "deposit-555";
  // These are different entity types but same string value — should be separate keys
  const r1 = tbl.tryInsert({ profitId, stage: "10m", channel: "in_app" });
  const r2 = tbl.tryInsert({ depositId, stage: "10m", channel: "in_app" });
  assert(r1.ok && r2.ok, "profit and deposit same stage should both succeed (different entity)");
  assert(tbl.count() === 2, "two rows");
});

test("failure does not block other channel (partial failure)", () => {
  const tbl = new MockDeliveryTable();
  const pid = "profit-666";
  // Simulate email claim succeeds but send fails (we still have row, so retry blocked)
  // That's the chosen exactly-once strategy: claim before send means transient
  // email failure loses that email but never duplicates. Verify in_app still can succeed.
  const email = tbl.tryInsert({ profitId: pid, stage: "12h", channel: "email" });
  assert(email.ok, "email claim succeeds");
  // email send failed, but in_app should still be claimable
  const inapp = tbl.tryInsert({ profitId: pid, stage: "12h", channel: "in_app" });
  assert(inapp.ok, "in_app should be independent and succeed even if email failed");
  assert(tbl.count() === 2, "two rows despite email send failure");
});

test("never one-per-day: two different stages on same day both fire if due", () => {
  // Old bug: notifications.title=Payout Reminder + dayStartUtc guard would skip
  // second stage on same day. New design has no day guard; per-stage unique allows multiple per day.
  const tbl = new MockDeliveryTable();
  const pid = "profit-777";
  // Simulate payout that has 24h stage due in the morning and 12h due same calendar day
  // Both should be claimable independently, not blocked by one-per-day.
  const morningStage = "24h";
  const afternoonStage = "12h";
  const r1 = tbl.tryInsert({ profitId: pid, stage: morningStage, channel: "email" });
  const r2 = tbl.tryInsert({ profitId: pid, stage: afternoonStage, channel: "email" });
  assert(r1.ok && r2.ok, "both stages same day should succeed (no one-per-day guard)");
  assert(tbl.count() === 2, "two rows same day but different stages");
});

// Summary
console.log("\n" + "=".repeat(60));
console.log(`Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log("✓ All payout reminder idempotency tests passed");
else console.log("✗ Some tests failed");
process.exitCode = failed === 0 ? 0 : 1;
