"use client";

import { useCallback, useEffect, useState } from "react";
import { Target, Trash2, Plus, Flag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel, GlowButton } from "@/components/ui";
import { extractErrorInfo } from "@/lib/errors";

/**
 * Personal Goals — planning/engagement only. NOT financial advice.
 * Progress comes from the server (authoritative account summary); the
 * client can never set achieved amounts or balances. No monetary rewards.
 */

interface Milestone {
  percent: number;
  state: "reached" | "locked";
}

interface Goal {
  id: string;
  title: string;
  target_amount: number;
  target_date: string | null;
  description: string | null;
  created_at: string;
  progress: {
    current_amount: number;
    percent: number;
    remaining: number;
    milestones: Milestone[];
    completed: boolean;
  };
}

const MAX_TARGET = 100000000;

function fmtPKR(n: number): string {
  return `${Math.round(n ?? 0).toLocaleString("en-PK")} PKR`;
}

function milestoneLabel(pct: number, isUr: boolean): string {
  if (pct >= 100) return isUr ? "ہدف مکمل" : "Goal completed";
  if (pct >= 75) return isUr ? "75% سنگ میل حاصل" : "75% milestone reached";
  if (pct >= 50) return isUr ? "آدھا راستہ طے ہو گیا" : "Halfway there";
  if (pct >= 25) return isUr ? "25% سنگ میل حاصل" : "25% milestone reached";
  return isUr ? "شروع کریں" : "Getting started";
}

export default function GoalsPage() {
  const { lang } = useI18n();
  const isUr = lang === "ur";
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [currentAmount, setCurrentAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form fields
  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/goals");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const info = extractErrorInfo(data?.error ?? null, "Could not load your goals.");
        setError(info.friendly + (data?.setup_pending ? (isUr ? " (ڈیٹا بیس سیٹ اپ زیر التوا)" : " (database setup pending)") : ""));
        setGoals([]);
        return;
      }
      setGoals(data.goals ?? []);
      setCurrentAmount(Number(data.current_amount ?? 0));
    } catch {
      setError(isUr ? "نیٹ ورک کا مسئلہ۔ دوبارہ کوشش کریں۔" : "A network problem occurred. Please try again.");
      setGoals([]);
    }
  }, [isUr]);

  useEffect(() => { load(); }, [load]);

  const validate = (): string | null => {
    if (title.trim().length < 1) return isUr ? "ہدف کا نام درکار ہے۔" : "Goal title is required.";
    if (title.trim().length > 80) return isUr ? "نام 80 حروف سے زیادہ نہیں ہو سکتا۔" : "Title is too long (max 80 characters).";
    const n = Number(targetAmount);
    if (!Number.isFinite(n) || n <= 0) return isUr ? "ہدف کی رقم مثبت ہونی چاہیے۔" : "Target amount must be a positive number.";
    if (n > MAX_TARGET) return isUr ? "رقم بہت زیادہ ہے۔" : "Target amount is too large.";
    if (targetDate) {
      const d = new Date(targetDate);
      if (Number.isNaN(d.getTime())) return isUr ? "تاریخ غلط ہے۔" : "Target date is invalid.";
    }
    if (description.trim().length > 500) return isUr ? "تفصیل 500 حروف سے زیادہ نہیں۔" : "Description is too long (max 500 characters).";
    return null;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    const v = validate();
    if (v) { setFormError(v); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          target_amount: Number(targetAmount),
          target_date: targetDate || null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const info = extractErrorInfo(data?.error ?? null, "Could not create the goal.");
        setFormError(info.friendly);
        return;
      }
      setNotice(isUr ? "ہدف بن گیا۔" : "Goal created.");
      setTitle(""); setTargetAmount(""); setTargetDate(""); setDescription("");
      setShowForm(false);
      await load();
    } catch {
      setFormError(isUr ? "نیٹ ورک کا مسئلہ۔" : "A network problem occurred.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const info = extractErrorInfo(data?.error ?? null, "Could not delete the goal.");
        setError(info.friendly);
        return;
      }
      setGoals((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
    } catch {
      setError(isUr ? "نیٹ ورک کا مسئلہ۔" : "A network problem occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-base text-on-surface pb-28 md:pb-10">
      <TopNav active="/goals" />

      <div className="max-w-3xl mx-auto px-4 pt-20 md:pt-24">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-headline-md font-bold text-primary tracking-tight">
            {isUr ? "ذاتی اہداف" : "Personal Goals"}
          </h1>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            aria-expanded={showForm}
            className="h-10 inline-flex items-center gap-1.5 rounded-lg bg-[#A8E636] px-3 text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Plus className="w-4 h-4" />
            {isUr ? "نیا ہدف" : "New goal"}
          </button>
        </div>
        <p className="text-label-sm text-on-surface-variant mb-6">
          {isUr
            ? "منصوبہ بندی کے لیے۔ یہ سرمایہ کاری کا مشورہ نہیں ہے اور نتائج کی ضمانت نہیں دیتا۔"
            : "For planning only. This is not financial advice and does not guarantee any result."}
        </p>

        {notice && (
          <div className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-3 text-sm text-primary mb-4" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error mb-4" role="alert">
            {error}
          </div>
        )}


        {showForm && (
          <GlassPanel className="p-5 mb-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="goal-title" className="mb-1 block text-label-md text-on-surface-variant">
                  {isUr ? "ہدف کا نام *" : "Goal title *"}
                </label>
                <input
                  id="goal-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder={isUr ? "مثلاً ایمرجنسی فنڈ" : "e.g. Emergency fund"}
                  className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="goal-amount" className="mb-1 block text-label-md text-on-surface-variant">
                    {isUr ? "ہدف کی رقم (PKR) *" : "Target amount (PKR) *"}
                  </label>
                  <input
                    id="goal-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="goal-date" className="mb-1 block text-label-md text-on-surface-variant">
                    {isUr ? "ہدف کی تاریخ (اختیاری)" : "Target date (optional)"}
                  </label>
                  <input
                    id="goal-date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="goal-desc" className="mb-1 block text-label-md text-on-surface-variant">
                  {isUr ? "تفصیل (اختیاری)" : "Description (optional)"}
                </label>
                <textarea
                  id="goal-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                />
              </div>
              {formError && (
                <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error" role="alert">
                  {formError}
                </div>
              )}
              <GlowButton type="submit" disabled={creating} className="w-full disabled:opacity-50">
                <Target className="w-5 h-5" />
                {creating ? (isUr ? "بن رہا ہے..." : "Creating...") : isUr ? "ہدف بنائیں" : "Create goal"}
              </GlowButton>
            </form>
          </GlassPanel>
        )}

        {goals === null && (
          <div className="space-y-3" role="status" aria-label={isUr ? "لوڈ ہو رہا ہے" : "Loading"}>
            {[0, 1].map((i) => (
              <div key={i} className="h-36 rounded-xl bg-surface-container-low animate-pulse" />
            ))}
          </div>
        )}

        {goals !== null && goals.length === 0 && !error && (
          <GlassPanel className="p-8 text-center">
            <Flag className="w-10 h-10 mx-auto text-on-surface-variant/50 mb-3" />
            <p className="text-sm text-on-surface-variant">
              {isUr
                ? "ابھی کوئی ہدف نہیں۔ اوپر سے اپنا پہلا ہدف بنائیں۔"
                : "No goals yet. Create your first goal above."}
            </p>
          </GlassPanel>
        )}


        {goals !== null && goals.length > 0 && (
          <ul className="space-y-4">
            {goals.map((g) => (
              <li key={g.id}>
                <GlassPanel className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h2 className="text-md font-bold text-on-surface truncate">{g.title}</h2>
                      {g.target_date && (
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {isUr ? "ہدف کی تاریخ" : "Target date"}: {new Date(g.target_date).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      disabled={deletingId === g.id}
                      aria-label={`${isUr ? "ہدف حذف کریں" : "Delete goal"}: ${g.title}`}
                      className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-error/60 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-bold text-on-surface">{fmtPKR(g.progress.current_amount)}</span>
                    <span className="text-on-surface-variant">{fmtPKR(g.target_amount)}</span>
                  </div>
                  <div
                    className="h-3 rounded-full bg-surface-container-high overflow-hidden mb-1"
                    role="progressbar"
                    aria-valuenow={g.progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${g.title}: ${g.progress.percent}%`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#9cd927] to-[#b7f646] transition-all"
                      style={{ width: `${g.progress.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mb-3">
                    <span className="font-semibold text-primary">{g.progress.percent}%</span>
                    <span className="text-on-surface-variant">
                      {isUr ? "باقی" : "Remaining"}: {fmtPKR(g.progress.remaining)}
                    </span>
                  </div>

                  {/* Milestones — states conveyed by fill + sr-only text, not color alone */}
                  <ol className="flex items-center gap-1.5 mb-2">
                    {g.progress.milestones.map((m) => (
                      <li key={m.percent} className="flex-1">
                        <div
                          className={`h-1.5 rounded-full ${m.state === "reached" ? "bg-primary" : "bg-surface-container-high"}`}
                          aria-hidden="true"
                        />
                        <p className={`text-[10px] mt-1 ${m.state === "reached" ? "text-primary font-semibold" : "text-on-surface-variant/60"}`}>
                          {m.percent}%
                        </p>
                        <span className="sr-only">{m.state === "reached" ? "reached" : "locked"}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs font-medium text-secondary">
                    {milestoneLabel(g.progress.percent, isUr)}
                    {g.description && (
                      <span className="block text-on-surface-variant font-normal mt-1">{g.description}</span>
                    )}
                  </p>
                </GlassPanel>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomNav active="/goals" />
    </main>
  );
}

