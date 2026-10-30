import { createServiceRoleClient } from "@/lib/supabase/server";
import { pickRandomLinks } from "@/lib/youtube-links";
import { pakistanDate } from "@/lib/dates";
export const TASKS_PER_DAY = 5;
export const DEDUCTION_PER_MISSED_DAY = 200;
export const todayStr = pakistanDate;
export interface PendingTask { id: string; task_date: string; youtube_link: string; screenshot_url: string | null; completed: boolean; completed_at: string | null; }
export interface EnsureTasksResult { missedDays: number; pendingTasks: PendingTask[]; }
export class TaskAccessError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
/** Postgres serializes creation, penalties and completion with one profile lock. */
export async function ensureAndLoadTasks(userId: string): Promise<EnsureTasksResult> {
  const client = await createServiceRoleClient();
  const { data, error } = await client.rpc("ensure_member_tasks", { p_user: userId, p_links: pickRandomLinks(TASKS_PER_DAY) });
  if (error) throw error;
  if (!data?.ok) throw new TaskAccessError(data?.reason ?? "task_load_failed");
  if (!Number.isInteger(data.missedDays) || !Array.isArray(data.pendingTasks)) throw new Error("Invalid task result");
  return { missedDays: data.missedDays, pendingTasks: data.pendingTasks as PendingTask[] };
}
