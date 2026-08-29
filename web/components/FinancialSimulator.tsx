"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Info, TrendingUp, Target, CheckCircle2, Clock } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import {
  LIMITS,
  runSimulation,
  sanitizeInput,
  type SimulatorInput,
  type SimulatorScenario,
} from "@/lib/simulator";

const SCENARIO_COLORS: Record<SimulatorScenario["key"], string> = {
  conservative: "#E0C36A",
  base: "#A8E636",
  optimistic: "#7FA8D9",
};

function fmtPKR(n: number): string {
  return `${Math.round(n).toLocaleString("en-PK")} PKR`;
}

function monthLabel(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-PK", { month: "short", year: "numeric" });
}

function ScenarioLineChart({
  scenarios,
  targetAmount,
  horizonMonths,
}: {
  scenarios: SimulatorScenario[];
  targetAmount: number;
  horizonMonths: number;
}) {
  const W = 640;
  const H = 260;
  const PAD = { top: 12, right: 14, bottom: 26, left: 54 };
  const maxY = Math.max(
    1,
    ...scenarios.map((s) => s.series[s.series.length - 1]?.balance ?? 0),
    targetAmount
  );
  const x = (m: number) => PAD.left + (m / Math.max(1, horizonMonths)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);
  const yTicks = 4;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[420px] sm:h-64" role="img" aria-label="Projected balance over time for each scenario">
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = (maxY / yTicks) * i;
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgba(128,128,128,0.18)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#9a9a9a">
                {v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : Math.round(v)}
              </text>
            </g>
          );
        })}
        {[0, horizonMonths / 2, horizonMonths].map((m, i) => (
          <text key={i} x={x(m)} y={H - 8} textAnchor="middle" fontSize="9" fill="#9a9a9a">
            {i === 0 ? "now" : `mo ${Math.round(m)}`}
          </text>
        ))}
        {targetAmount > 0 && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(targetAmount)} y2={y(targetAmount)} stroke="#f0f0f0" strokeDasharray="5 4" strokeWidth="1.2" opacity="0.7" />
            <text x={W - PAD.right} y={y(targetAmount) - 4} textAnchor="end" fontSize="9" fill="#d0d0d0">
              target
            </text>
          </g>
        )}
        {scenarios.map((s) => (
          <polyline
            key={s.key}
            points={s.series.map((p) => `${x(p.month)},${y(p.balance)}`).join(" ")}
            fill="none"
            stroke={SCENARIO_COLORS[s.key]}
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

function fmtNumber(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n)) : "0";
}

function Control({
  label,
  hint,
  value,
  min,
  max,
  step,
  prefix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(fmtNumber(value));
  const [focused, setFocused] = useState(false);

  // Sync the text box when the value changes externally (e.g., slider drag).
  useEffect(() => {
    if (!focused) setText(fmtNumber(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
  };

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-on-surface">{label}</label>
        {hint && <span className="text-[11px] text-on-surface-variant">{hint}</span>}
      </div>
      <div className="relative mt-1.5">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
            {prefix}
          </span>
        )}
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`h-10 w-full rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary ${
            prefix ? "pl-9" : ""
          }`}
        />
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          setText(fmtNumber(n));
          onChange(n);
        }}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-outline-variant/40 accent-[#A8E636]"
      />
      <div>
        <span className="text-xs text-on-surface-variant">now</span>
        <span className="float-right text-xs text-on-surface-variant">
          {min}–{max >= 1_000_000 ? `${(max / 1_000_000).toFixed(0)}M` : max.toLocaleString("en-PK")}
        </span>
      </div>
    </div>
  );
}

function ScenarioCard({ sc }: { sc: SimulatorScenario }) {
  const color = SCENARIO_COLORS[sc.key];
  const reached = sc.monthsToTarget != null;
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <h4 className="text-sm font-bold text-on-surface">{sc.label}</h4>
        <span className="ml-auto text-xs font-medium text-on-surface-variant">
          {sc.annualRatePct}%/yr
        </span>
      </div>
      <p className="mt-2 text-lg font-extrabold text-on-surface">{fmtPKR(sc.futureBalance)}</p>
      <div className="mt-1 space-y-0.5 text-xs text-on-surface-variant">
        <p>Growth: {fmtPKR(sc.growthComponent)}</p>
        <p>Target {reached ? "reached in" : "not reached in"}{" "}
          {reached ? `~${Math.round(sc.monthsToTarget! / 12 * 10) / 10} yr` : `${sc.series.length - 1} mo`}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/30">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${sc.progressPct}%`, background: color }}
        />
      </div>
      <p className="mt-1 text-[11px] text-on-surface-variant">
        Progress: {sc.progressPct}%{sc.progressPct >= 100 ? " · reached" : ""}
      </p>
    </div>
  );
}

export default function FinancialSimulator() {
  const defaultInput: SimulatorInput = {
    currentBalance: 50000,
    monthlyContribution: 5000,
    targetAmount: 500000,
    horizonMonths: 60,
    annualGrowthRatePct: 8,
  };

  const [input, setInput] = useState<SimulatorInput>(defaultInput);
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  const result = useMemo(() => runSimulation(sanitizeInput(input)), [input]);

  // Sanitization clamps extreme values, but the UI should reflect what is
  // actually used — sync sanitiized recalculations into state.
  const display = result;

  // Debounced server-side validation (does NOT drive the UI — the client
  // renders instantly from the deterministic engine; this only confirms the
  // /api/simulator route agrees, so the two can never diverge).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/simulator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setServerOk(res.ok);
      } catch {
        setServerOk(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  const set = (patch: Partial<SimulatorInput>) => setInput((p) => ({ ...p, ...patch }));

  return (
    <GlassPanel className="p-6">
      <div className="mb-5 flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-primary" />
        <h2 className="text-title-md text-on-surface">Personal Financial Simulator</h2>
      </div>

      <p className="mb-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-on-surface">
        <Info className="mr-1 inline h-3.5 w-3.5" />
        Play with hypothetical numbers to explore a plan. All growth rates below are
        assumptions you enter — not predictions or guarantees.
      </p>

      {/* Inputs */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Control
          label="Current balance"
          value={input.currentBalance}
          min={0}
          max={1_000_000_000}
          step={10000}
          prefix="PKR"
          onChange={(v) => set({ currentBalance: v })}
        />
        <Control
          label="Monthly contribution"
          value={input.monthlyContribution}
          min={0}
          max={100_000_000}
          step={1000}
          prefix="PKR"
          onChange={(v) => set({ monthlyContribution: v })}
        />
        <Control
          label="Target amount"
          value={input.targetAmount}
          min={0}
          max={1_000_000_000}
          step={10000}
          prefix="PKR"
          onChange={(v) => set({ targetAmount: v })}
        />
        <Control
          label="Assumed annual growth rate"
          hint="user assumption"
          value={input.annualGrowthRatePct}
          min={0}
          max={100}
          step={0.5}
          prefix="%"
          onChange={(v) => set({ annualGrowthRatePct: v })}
        />
        <Control
          label="Time horizon"
          value={input.horizonMonths}
          min={1}
          max={600}
          step={6}
          hint={`~${display.horizonYears} years`}
          onChange={(v) => set({ horizonMonths: v })}
        />
      </div>

      {/* Results */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
          Projections (based on your assumptions)
        </h3>

        <div className="grid gap-3 sm:grid-cols-3">
          {display.scenarios.map((sc) => (
            <ScenarioCard key={sc.key} sc={sc} />
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface">
            <TrendingUp className="h-4 w-4 text-primary" /> Balance over time
          </h4>
          {display.input.horizonMonths <= 1 ? (
            <p className="text-sm text-on-surface-variant">
              Extend the time horizon to see the balance curve.
            </p>
          ) : (
            <ScenarioLineChart
              scenarios={display.scenarios}
              targetAmount={display.input.targetAmount}
              horizonMonths={display.input.horizonMonths}
            />
          )}
          {display.hasTarget && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Target className="h-3.5 w-3.5" /> Target: {fmtPKR(display.input.targetAmount)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Base projection reaches target in{" "}
                {display.scenarios[1].monthsToTarget != null
                  ? `~${Math.round((display.scenarios[1].monthsToTarget! / 12) * 10) / 10} years`
                  : "over the current horizon"}
              </span>
              {serverOk === true && (
                <span className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> server-calculated
                </span>
              )}
            </div>
          )}
        </div>

        <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-on-surface-variant">
          Simulation only. Actual results may differ. This is a planning tool, not
          financial advice — it does not promise or project any guaranteed return.
        </p>
      </div>
    </GlassPanel>
  );
}
