/**
 * Payout reminder stage logic — single source of truth for the cron and tests.
 *
 * Vercel Hobby forbids minute crons (every 5 minutes). The authoritative schedule is an
 * external 5-minute hit to GET /api/cron/payout-reminders with CRON_SECRET.
 * vercel.json keeps the allowed daily 0 0 * * * as a fallback only — it alone
 * cannot satisfy the 10m granularity.
 *
 * Stages are 48h,24h,12h,1h,10m before payout_date. Each stage must be
 * delivered exactly once per payout entity (profit_id or deposit_id) per
 * channel (email vs in_app). The DB table payout_reminder_deliveries enforces
 * this with partial unique indexes on (profit_id,stage,channel) and
 * (deposit_id,stage,channel). The cron therefore never needs an in-memory
 * guard and is safe for concurrent / retry executions.
 *
 * Multi-member independence is natural: the unique key includes the specific
 * payout id, so member A failure never blocks member B.
 */

export type ReminderStage = "48h" | "24h" | "12h" | "1h" | "10m";
export type ReminderChannel = "email" | "in_app";

export interface StageDef {
  stage: ReminderStage;
  ms: number;
}

export const REMINDER_STAGES: readonly StageDef[] = [
  { stage: "48h", ms: 48 * 60 * 60 * 1000 },
  { stage: "24h", ms: 24 * 60 * 60 * 1000 },
  { stage: "12h", ms: 12 * 60 * 60 * 1000 },
  { stage: "1h", ms: 1 * 60 * 60 * 1000 },
  { stage: "10m", ms: 10 * 60 * 1000 },
] as const;

/**
 * Tolerance window for stage capture. External cron runs every ~5 min, so a
 * 5-minute window guarantees each stage is captured exactly once without
 * requiring precise clock alignment. Larger windows would cause repeated
 * claim attempts (harmless due to unique constraint but wasteful).
 * For the 10m stage the window is 5m => due when 10m >= delta >5m.
 */
export const REMINDER_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Returns the list of stages that are currently due for a given payout_date.
 * A stage is due when payout_date - now is within (stage.ms - tolerance, stage.ms]
 * and payout_date is in the future. This narrow window ensures exactly one
 * delivery per stage even when the endpoint is called every 5m (or more
 * frequently). If the external scheduler is down and a window is missed, that
 * stage is intentionally not backfilled late — only future stages will fire —
 * to avoid spamming overdue reminders. Adjust tolerance or use a broader
 * window if late-catch-up is desired.
 *
 * The DB unique constraint is the source of truth for "already sent"; this
 * function only decides which stage(s) are eligible to be claimed right now.
 */
export function getDueStages(
  payoutDate: Date,
  now: Date = new Date(),
  toleranceMs: number = REMINDER_TOLERANCE_MS
): ReminderStage[] {
  const delta = payoutDate.getTime() - now.getTime();
  if (!Number.isFinite(delta) || delta <= 0) return [];
  const due: ReminderStage[] = [];
  for (const { stage, ms } of REMINDER_STAGES) {
    if (delta <= ms && delta > ms - toleranceMs) {
      due.push(stage);
    }
  }
  return due;
}

/**
 * Helper for externally testing whether a specific stage is due.
 */
export function isStageDue(
  stage: ReminderStage,
  payoutDate: Date,
  now: Date = new Date(),
  toleranceMs: number = REMINDER_TOLERANCE_MS
): boolean {
  const def = REMINDER_STAGES.find((s) => s.stage === stage);
  if (!def) return false;
  const delta = payoutDate.getTime() - now.getTime();
  return delta > 0 && delta <= def.ms && delta > def.ms - toleranceMs;
}

/**
 * For ordering / display: sort stages from furthest to nearest.
 */
export function sortStages(stages: ReminderStage[]): ReminderStage[] {
  const order: Record<ReminderStage, number> = {
    "48h": 0,
    "24h": 1,
    "12h": 2,
    "1h": 3,
    "10m": 4,
  };
  return [...stages].sort((a, b) => order[a] - order[b]);
}
