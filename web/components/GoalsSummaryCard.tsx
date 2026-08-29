"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GlassPanel } from "@/components/ui";

/**
 * Compact goals summary for the dashboard. Loads /api/goals once; renders
 * nothing while the goals database setup is pending (setup_pending) so the
 * dashboard stays clean until the migration is applied. Never displays a
 * client-computed amount — all numbers come from the server.
 */

interface Goal {
  id: string;
  title: string;
  target_amount: number;
  progress: {
    current_amount: number;
    percent: number;
    milestones: { percent: number; state: "reached" | "locked" }[];
  };
}

export default function GoalsSummaryCard() {
  const { lang } = useI18n();
  const isUr = lang === "ur";
  const [goal, setGoal] = useState<Goal | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/goals");
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.setup_pending) { setHidden(true); return; }
        const goals: Goal[] = data?.goals ?? [];
        // Show the goal closest to completion (most motivating summary).
        setGoal(goals.length > 0 ? [...goals].sort((a, b) => b.progress.percent - a.progress.percent)[0] : null);
      } catch {
        setHidden(true); // network/permission issue — silently skip the card
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (hidden) return null;

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-label-md text-on-surface-variant font-semibold flex items-center gap-1.5">
          <Target className="w-4 h-4 text-primary" />
          {isUr ? "ذاتی اہداف" : "Personal goals"}
        </h2>
        <Link
          href="/goals"
          className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
          aria-label={isUr ? "اہداف دیکھیں" : "View goals"}
        >
          {isUr ? "سب دیکھیں" : "View all"}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {goal ? (
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-semibold text-on-surface truncate">{goal.title}</span>
            <span className="font-bold text-primary shrink-0 ml-2">{goal.progress.percent}%</span>
          </div>
          <div
            className="h-2.5 rounded-full bg-surface-container-high overflow-hidden mb-1"
            role="progressbar"
            aria-valuenow={goal.progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.title}: ${goal.progress.percent}%`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9cd927] to-[#b7f646]"
              style={{ width: `${goal.progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-on-surface-variant">
            {`${Math.round(goal.progress.current_amount).toLocaleString("en-PK")} / ${Math.round(goal.target_amount).toLocaleString("en-PK")} PKR`}
            {" · "}
            {isUr ? "منصوبہ بندی کے لیے — مشورہ نہیں" : "planning only — not advice"}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-on-surface-variant mb-2">
            {isUr
              ? "اپنا پہلا ہدف بنائیں اور پیش رفت دیکھیں۔"
              : "Create your first goal and track your progress toward it."}
          </p>
          <Link
            href="/goals"
            className="inline-flex items-center gap-1 h-10 px-4 rounded-lg bg-[#A8E636] text-sm font-bold text-[#0B2E1F] hover:bg-[#b8f04a] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Target className="w-4 h-4" />
            {isUr ? "ہدف بنائیں" : "Create a goal"}
          </Link>
        </div>
      )}
    </GlassPanel>
  );
}
