/**
 * TDX Personal Financial Simulator — deterministic calculation engine.
 *
 * Pure functions only: no I/O, no React, no randomness. Shared by the
 * client UI (instant recalculation) and the /api/simulator route
 * (server-side calculation), so both always produce identical results.
 *
 * Model: fixed monthly contributions at month-end, growth compounded
 * monthly. All rates on this page are USER-ENTERED ASSUMPTIONS used for
 * what-if exploration. Nothing here predicts or guarantees any outcome.
 */

export const LIMITS = {
  MAX_BALANCE: 1_000_000_000, // per-amount sanity cap
  MAX_CONTRIBUTION: 100_000_000,
  MAX_TARGET: 1_000_000_000,
  MIN_HORIZON: 1,
  MAX_HORIZON: 600, // 50 years
  MIN_RATE_PCT: 0,
  MAX_RATE_PCT: 100,
  SCENARIO_OFFSET_PCT: 3, // Conservative = assumed − 3pp, Optimistic = assumed + 3pp
} as const;

export interface SimulatorInput {
  currentBalance: number;
  monthlyContribution: number;
  targetAmount: number;
  horizonMonths: number;
  annualGrowthRatePct: number;
}

export interface SimulatorScenario {
  key: "conservative" | "base" | "optimistic";
  label: string;
  annualRatePct: number;
  futureBalance: number;
  totalContributed: number;
  growthComponent: number;
  progressPct: number;
  monthsToTarget: number | null; // null = target not reached within the horizon
  series: { month: number; balance: number }[];
}

export interface SimulatorResult {
  input: SimulatorInput; // sanitized values actually used
  hasTarget: boolean;
  scenarios: SimulatorScenario[];
  horizonYears: number;
}

/** Coerce unknown/missing/invalid input into a safe, finite value. */
function toSafeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return n;
}

/** Sanitize raw user input into a valid SimulatorInput. */
export function sanitizeInput(raw: Partial<Record<keyof SimulatorInput, unknown>>): SimulatorInput {
  const clampMin0 = (v: unknown, max: number) =>
    Math.min(Math.max(0, Math.round(toSafeNumber(v))), max);
  return {
    currentBalance: clampMin0(raw.currentBalance, LIMITS.MAX_BALANCE),
    monthlyContribution: clampMin0(raw.monthlyContribution, LIMITS.MAX_CONTRIBUTION),
    targetAmount: clampMin0(raw.targetAmount, LIMITS.MAX_TARGET),
    horizonMonths: Math.min(
      Math.max(LIMITS.MIN_HORIZON, Math.round(toSafeNumber(raw.horizonMonths, 60))),
      LIMITS.MAX_HORIZON
    ),
    annualGrowthRatePct: Math.min(
      Math.max(LIMITS.MIN_RATE_PCT, toSafeNumber(raw.annualGrowthRatePct, 0)),
      LIMITS.MAX_RATE_PCT
    ),
  };
}

/**
 * Project month-by-month. Growth compounds monthly; the contribution is
 * applied at the end of each month. Month 0 is the starting balance.
 * All rates are assumptions supplied by the user.
 */
function projectSeries(
  startBalance: number,
  monthlyContribution: number,
  monthlyRate: number,
  months: number
): number[] {
  const series: number[] = [startBalance];
  let balance = startBalance;
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    // Guard against float drift at extreme magnitudes.
    if (!Number.isFinite(balance) || balance > LIMITS.MAX_BALANCE * 1000) {
      balance = LIMITS.MAX_BALANCE * 1000;
    }
    series.push(Math.round(balance * 100) / 100);
  }
  return series;
}

/** Run the three-scenario simulation for sanitized inputs. */
export function runSimulation(input: SimulatorInput): SimulatorResult {
  const { currentBalance, monthlyContribution, targetAmount, horizonMonths } = input;
  const assumed = input.annualGrowthRatePct;

  const scenarioDefs: {
    key: SimulatorScenario["key"];
    label: string;
    ratePct: number;
  }[] = [
    {
      key: "conservative",
      label: "Conservative",
      ratePct: Math.max(LIMITS.MIN_RATE_PCT, assumed - LIMITS.SCENARIO_OFFSET_PCT),
    },
    { key: "base", label: "Base", ratePct: assumed },
    {
      key: "optimistic",
      label: "Optimistic",
      ratePct: Math.min(LIMITS.MAX_RATE_PCT, assumed + LIMITS.SCENARIO_OFFSET_PCT),
    },
  ];

  const hasTarget = targetAmount > 0;

  const scenarios: SimulatorScenario[] = scenarioDefs.map((def) => {
    const monthlyRate = def.ratePct / 100 / 12;
    const seriesRaw = projectSeries(
      currentBalance,
      monthlyContribution,
      monthlyRate,
      horizonMonths
    );
    const series = seriesRaw.map((balance, i) => ({ month: i, balance }));
    const futureBalance = seriesRaw[seriesRaw.length - 1];
    const totalContributed = monthlyContribution * horizonMonths;
    const growthComponent =
      Math.round((futureBalance - currentBalance - totalContributed) * 100) / 100;

    let monthsToTarget: number | null = null;
    if (hasTarget) {
      for (let m = 0; m < seriesRaw.length; m++) {
        if (seriesRaw[m] >= targetAmount) {
          monthsToTarget = m; // month 0 = starting balance already at/above target
          break;
        }
      }
    }

    const progressPct = hasTarget
      ? Math.min(100, Math.round((futureBalance / targetAmount) * 10000) / 100)
      : 0;

    return {
      key: def.key,
      label: def.label,
      annualRatePct: def.ratePct,
      futureBalance: Math.round(futureBalance * 100) / 100,
      totalContributed,
      growthComponent: Math.max(0, growthComponent),
      progressPct,
      monthsToTarget,
      series,
    };
  });

  return {
    input,
    hasTarget,
    scenarios,
    horizonYears: Math.round((horizonMonths / 12) * 10) / 10,
  };
}
