"use client";

import { useCallback, useEffect, useState } from "react";
import { HeartPulse, RefreshCw, Info, Lightbulb } from "lucide-react";
import { GlassPanel } from "@/components/ui";

interface HealthComponent {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}

interface HealthScoreData {
  available: boolean;
  message?: string;
  score?: number;
  category?: string;
  components?: HealthComponent[];
  summary?: {
    componentsUsed: number;
    componentsTotal: number;
    strongest: { label: string; score: number };
    weakest: { label: string; score: number };
    explanation: string;
  };
  suggestions?: string[];
  disclaimer?: string;
  calculatedAt: string;
}

function categoryTone(score: number): { ring: string; text: string; bar: string } {
  if (score <= 20) return { ring: "#B0B6AD", text: "text-on-surface-variant", bar: "bg-on-surface-variant/50" };
  if (score <= 40) return { ring: "#E0C36A", text: "text-[#8a6d1f]", bar: "bg-[#E0C36A]" };
  if (score <= 60) return { ring: "#7FA8D9", text: "text-[#3a6691]", bar: "bg-[#7FA8D9]" };
  if (score <= 80) return { ring: "#7CC98A", text: "text-[#2f6d3d]", bar: "bg-[#7CC98A]" };
  return { ring: "#A8E636", text: "text-primary", bar: "bg-primary" };
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const tone = categoryTone(score);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={tone.ring}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-on-surface">{score}</span>
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">of 100</span>
      </div>
    </div>
  );
}

export default function FinancialHealthCard() {
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health-score", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not load your health score.");
      setData(body as HealthScoreData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your health score.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshedAt = data?.calculatedAt
    ? new Date(data.calculatedAt).toLocaleString("en-PK", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <GlassPanel className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-title-md flex items-center gap-2 text-on-surface">
          <HeartPulse className="h-5 w-5 text-primary" />
          Financial Health Score
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Recalculate"
          aria-label="Recalculate health score"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/40 text-on-surface-variant transition-colors hover:bg-surface-bright disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data && (
        <div className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
          <div className="h-36 w-36 animate-pulse rounded-full bg-surface-bright" />
          <div className="h-4 w-40 animate-pulse rounded bg-surface-bright" />
          <div className="h-3 w-64 animate-pulse rounded bg-surface-bright" />
          <span className="sr-only">Calculating your financial health score…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 rounded-lg border border-error/40 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && !data.available && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-6 text-center">
          <p className="text-sm text-on-surface-variant">{data.message}</p>
        </div>
      )}

      {!loading && !error && data?.available && data.score != null && (
        <div>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
            <ScoreRing score={data.score} />
            <div className="text-center sm:text-left">
              <p className={`text-xl font-bold ${categoryTone(data.score).text}`}>{data.category}</p>
              <p className="mt-1 text-sm text-on-surface-variant">{data.summary?.explanation}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(data.components ?? []).map((c) => (
              <div
                key={c.key}
                className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface">
                    {c.label}
                    <span className="ml-1 font-normal text-on-surface-variant">({c.weight}%)</span>
                  </span>
                  <span className="font-bold text-on-surface">
                    {c.score != null ? `${c.score}/100` : "—"}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/30">
                  <div
                    className={`h-full rounded-full ${c.score != null ? categoryTone(c.score).bar : ""}`}
                    style={{ width: `${c.score ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-on-surface-variant">{c.detail}</p>
              </div>
            ))}
          </div>

          <details className="group mt-4 rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-on-surface">
              <Info className="h-4 w-4 text-on-surface-variant" />
              How this score works
            </summary>
            <div className="mt-2 space-y-1.5 text-xs text-on-surface-variant">
              <p>
                The score combines six rule-based areas of your account: task consistency (20%),
                portfolio activity (20%), cycle/goal progress (15%), balance stability (20%),
                transaction consistency (15%) and account maturity (10%). Each area is measured
                from your account data and normalized to 0–100.
              </p>
              <p>
                Areas without enough data are excluded, and the remaining areas are re-weighted so
                the total always reflects what can actually be measured.
              </p>
            </div>
          </details>

          {(data.suggestions ?? []).length > 0 && (
            <div className="mt-4 rounded-lg border border-secondary/30 bg-secondary/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Lightbulb className="h-4 w-4 text-secondary" />
                Ideas to consider
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                {(data.suggestions ?? []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 border-t border-outline-variant/30 pt-3">
            <p className="text-[11px] leading-relaxed text-on-surface-variant">{data.disclaimer}</p>
            {refreshedAt && (
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Last calculated: {refreshedAt}
              </p>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
