"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Play, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel } from "@/components/ui";

interface PendingTask {
  id: string;
  task_date: string;
  youtube_link: string;
  screenshot_url: string | null;
  completed: boolean;
  completed_at: string | null;
}

const COMMENTS = ["nice video", "good work", "love it"];

function missedDaysText(n: number): string {
  return `⚠️ You missed ${n} day${n > 1 ? "s" : ""} — Rs 200 per day has been deducted from your account.`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TasksPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();

  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missedDays, setMissedDays] = useState(0);
  const [showDeductionPopup, setShowDeductionPopup] = useState(false);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const res = await fetch("/api/tasks/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load tasks");

      setTasks(data.pendingTasks ?? []);
      setMissedDays(data.missedDays ?? 0);
      if ((data.missedDays ?? 0) > 0) {
        setShowDeductionPopup(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.task_date === todayStr),
    [tasks, todayStr]
  );
  const rolloverTasks = useMemo(
    () => tasks.filter((t) => t.task_date !== todayStr),
    [tasks, todayStr]
  );

  const todayAllDone = useMemo(
    () => todayTasks.length > 0 && todayTasks.every((t) => t.completed),
    [todayTasks]
  );

  useEffect(() => {
    if (todayAllDone) setAllDone(true);
  }, [todayAllDone]);

  const handleScreenshot = useCallback(
    async (task: PendingTask, file: File) => {
      if (!userId) return;
      setUploadingTaskId(task.id);
      setError(null);
      try {
        const path = `${userId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("task-screenshots")
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;

        const res = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id, userId, path }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to complete task");

        setTasks((prev) =>
          prev.map((x) =>
            x.id === task.id
              ? {
                  ...x,
                  completed: true,
                  completed_at: new Date().toISOString(),
                  screenshot_url: data.screenshot_url,
                }
              : x
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploadingTaskId(null);
      }
    },
    [supabase, userId]
  );

  const renderTaskCard = (task: PendingTask) => {
    const isToday = task.task_date === todayStr;
    return (
      <GlassPanel key={task.id} className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            {isToday ? t("today") : formatDate(task.task_date)}
          </span>
          {task.completed ? (
            <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary border border-primary/30">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {t("completed")}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary border border-secondary/30">
              {t("pending")}
            </span>
          )}
        </div>

        <p className="mb-3 break-all text-sm text-on-surface-variant">
          {task.youtube_link}
        </p>

        <a
          href={task.youtube_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex h-10 items-center rounded-lg bg-primary-container text-on-primary-container px-4 text-sm font-bold transition-colors hover:bg-primary-fixed"
        >
          <Play className="w-4 h-4 mr-2" />
          {t("openYouTube")}
        </a>

        <div className="mb-3 rounded bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
          <p className="font-semibold">{t("instructions")}</p>
          <p>{t("watchVideo")}</p>
          <p>{t("likeVideo")}</p>
          <p>{t("subscribe")}</p>
          <p>
            {t("comment")}{" "}
            <span className="font-semibold text-secondary">
              "{COMMENTS[Math.floor(Math.random() * COMMENTS.length)]}"
            </span>
          </p>
        </div>

        {!task.completed ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">
              {t("uploadScreenshot")} <span className="text-error">*</span>
            </label>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingTaskId === task.id}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleScreenshot(task, f);
                e.target.value = "";
              }}
              className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-sm text-on-surface file:mr-3 file:rounded file:border-0 file:bg-primary-container file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-primary-container disabled:opacity-50"
            />
            {uploadingTaskId === task.id && (
              <p className="mt-1 text-xs text-primary">{t("uploading")}</p>
            )}
          </div>
        ) : (
          task.screenshot_url && (
            <p className="text-xs text-primary">{t("screenshotUploaded")}</p>
          )
        )}
      </GlassPanel>
    );
  };

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/tasks" />
      <BottomNav active="/tasks" />

      <div className="w-full max-w-3xl mx-auto px-container-padding pt-6 md:pt-8 flex flex-col gap-6 relative z-10">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6 text-primary" />
          <h1 className="text-headline-lg font-bold text-primary">
            {t("tasks")}
          </h1>
        </div>

        {showDeductionPopup && missedDays > 0 && (
          <div className="rounded-2xl border border-error/30 bg-error/10 p-4 text-on-surface shadow-lg">
            <p className="font-bold text-error">
              {missedDaysText(missedDays)}
            </p>
            <button
              type="button"
              onClick={() => setShowDeductionPopup(false)}
              className="mt-2 h-9 rounded-lg bg-error px-4 text-sm font-semibold text-on-error transition-colors hover:opacity-90"
            >
              {t("ok")}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <GlassPanel className="p-6">
            <p className="text-sm text-on-surface-variant">{t("loading")}</p>
          </GlassPanel>
        ) : (
          <div className="space-y-6">
            {allDone && (
              <GlassPanel className="p-6 text-center">
                <p className="text-lg font-bold text-primary">
                  {t("allTasksDone")}
                </p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t("greatJob")}
                </p>
              </GlassPanel>
            )}

            {rolloverTasks.length > 0 && (
              <div>
                <h2 className="mb-3 text-lg font-bold text-secondary">
                  {t("pendingFromPrevious")}
                </h2>
                <div className="space-y-3">
                  {rolloverTasks.map(renderTaskCard)}
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-lg font-bold text-primary">
                {t("todaysTasks")}
              </h2>
              {todayTasks.length > 0 ? (
                <div className="space-y-3">{todayTasks.map(renderTaskCard)}</div>
              ) : (
                <GlassPanel className="p-6">
                  <p className="text-sm text-on-surface-variant">
                    {t("noTasksToday")}
                  </p>
                </GlassPanel>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-sm text-on-surface-variant">
          <Link href="/dashboard" className="text-primary hover:underline">
            {t("backToDashboard")}
          </Link>
        </p>
      </div>
    </main>
  );
}