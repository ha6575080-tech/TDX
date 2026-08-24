import { createServiceRoleClient } from "@/lib/supabase/server";
import { pickRandomLinks } from "@/lib/youtube-links";

export const TASKS_PER_DAY = 5;
export const DEDUCTION_PER_MISSED_DAY = 200;

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PendingTask {
  id: string;
  task_date: string;
  youtube_link: string;
  screenshot_url: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface EnsureTasksResult {
  missedDays: number;
  pendingTasks: PendingTask[];
}

// Ensures today's 5 tasks exist, applies deductions for missed days,
// and returns pending tasks (previous-day uncompleted first, then today's).
export async function ensureAndLoadTasks(
  userId: string
): Promise<EnsureTasksResult> {
  const supabase = await createServiceRoleClient();
  const today = todayStr();

  // 1. Ensure today's 5 tasks exist for this user.
  const { data: existingToday, error: todayError } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("task_date", today);

  if (todayError) throw new Error(todayError.message);

  if (!existingToday || existingToday.length === 0) {
    const links = pickRandomLinks(TASKS_PER_DAY);
    const rows = links.map((link) => ({
      user_id: userId,
      task_date: today,
      youtube_link: link,
      completed: false,
      deduction_applied: false,
    }));
    const { error: insertError } = await supabase.from("tasks").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  // 2. Deduction logic: find missed days BEFORE today.
  const { data: allTasks, error: allError } = await supabase
    .from("tasks")
    .select("id, task_date, completed, deduction_applied")
    .eq("user_id", userId)
    .lt("task_date", today);

  if (allError) throw new Error(allError.message);

  const byDate = new Map<string, typeof allTasks>();
  for (const t of allTasks ?? []) {
    const list = byDate.get(t.task_date) ?? [];
    list.push(t);
    byDate.set(t.task_date, list);
  }

  let missedDays = 0;
  const datesToMark = new Set<string>();

  for (const [date, tasks] of byDate) {
    const completedCount = tasks.filter((t) => t.completed).length;
    const deductionApplied = tasks.every((t) => t.deduction_applied);
    if (completedCount < TASKS_PER_DAY && !deductionApplied) {
      missedDays += 1;
      datesToMark.add(date);
    }
  }

  if (missedDays > 0) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("daily_tasks_failed, total_deductions")
      .eq("id", userId)
      .single();

    if (profileError) throw new Error(profileError.message);

    const newFailed = (profile?.daily_tasks_failed ?? 0) + missedDays;
    const newDeductions =
      (Number(profile?.total_deductions) || 0) +
      missedDays * DEDUCTION_PER_MISSED_DAY;

    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        daily_tasks_failed: newFailed,
        total_deductions: newDeductions,
      })
      .eq("id", userId);

    if (updateProfileError) throw new Error(updateProfileError.message);

    const { error: markError } = await supabase
      .from("tasks")
      .update({ deduction_applied: true })
      .eq("user_id", userId)
      .in("task_date", Array.from(datesToMark));

    if (markError) throw new Error(markError.message);
  }

  // 3. Load pending tasks: previous-day uncompleted FIRST, then today's.
  const { data: pending, error: pendingError } = await supabase
    .from("tasks")
    .select("id, task_date, youtube_link, screenshot_url, completed, completed_at")
    .eq("user_id", userId)
    .eq("completed", false)
    .order("task_date", { ascending: true });

  if (pendingError) throw new Error(pendingError.message);

  return {
    missedDays,
    pendingTasks: (pending ?? []) as PendingTask[],
  };
}