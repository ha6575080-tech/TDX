import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { extractErrorInfo } from "@/lib/errors";
import { computeSummaryTotals } from "@/lib/account-summary";
import { internalError, logServerWarn } from "@/lib/api-errors";

/**
 * Personal goals — planning/engagement feature. NOT financial advice.
 * Goals never modify balances or financial records.
 *
 * Progress is DERIVED server-side from the authoritative account summary
 * (lib/account-summary.ts — the exact same numbers shown on the dashboard).
 * The client can never set current amounts, profit, or balances.
 *
 * Milestone notifications are event-driven: emitted only when the computed
 * progress crosses 25/50/75/100% beyond the stored milestones_reached
 * counter — never on repeated renders.
 */

const MILESTONES = [25, 50, 75, 100] as const;

function milestoneState(pct: number, threshold: number): "reached" | "locked" {
  return pct >= threshold ? "reached" : "locked";
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = user.id;

  const supabase = await createClient();

  const [goalsRes, profileRes, depositsRes, profitsRes, withdrawalsRes] =
    await Promise.all([
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("total_deductions, investment_amount")
        .eq("id", userId)
        .single(),
      supabase.from("deposits").select("amount, status").eq("user_id", userId),
      supabase.from("profits").select("amount, status").eq("user_id", userId),
      supabase.from("withdrawals").select("amount, status").eq("user_id", userId),
    ]);

  if (goalsRes.error) {
    // If the goals table does not exist yet (migration pending), report a
    // clean, actionable state instead of a raw DB error.
    if (goalsRes.error.code === "42P01") {
      return NextResponse.json(
        { error: "Goals are not available yet. Please try again later.", setup_pending: true },
        { status: 503 }
      );
    }
    const info = extractErrorInfo(goalsRes.error, "Could not load goals.");
    return NextResponse.json({ error: info.friendly }, { status: 500 });
  }
  if (profileRes.error) {
    return internalError("goals", profileRes.error);
  }

  // Authoritative progress basis — same numbers as the dashboard summary.
  const summary = computeSummaryTotals(
    profileRes.data,
    depositsRes.data ?? [],
    profitsRes.data ?? [],
    withdrawalsRes.data ?? []
  );
  const currentAmount = Math.max(0, summary.totalBalance);

  const goals = (goalsRes.data ?? []).map((g) => {
    const target = Number(g.target_amount ?? 0);
    const pct = target > 0 ? Math.min(100, Math.round((currentAmount / target) * 100)) : 0;
    const milestones = MILESTONES.map((m) => ({
      percent: m,
      state: milestoneState(pct, m),
    }));
    return {
      id: g.id as string,
      title: g.title as string,
      target_amount: target,
      target_date: (g.target_date as string | null) ?? null,
      description: (g.description as string | null) ?? null,
      created_at: g.created_at as string,
      progress: {
        current_amount: currentAmount,
        percent: pct,
        remaining: Math.max(0, target - currentAmount),
        milestones,
        completed: pct >= 100,
      },
    };
  });

  // Event-driven milestone notifications (state transition, not render-time):
  // notify once per milestone using the stored milestones_reached counter.
  const highestReached = (pct: number) => {
    let idx = 0;
    MILESTONES.forEach((m, i) => { if (pct >= m) idx = i + 1; });
    return idx; // 0..4
  };

  const dueNotifs = (goalsRes.data ?? [])
    .map((g) => {
      const target = Number(g.target_amount ?? 0);
      const pct = target > 0 ? Math.min(100, Math.round((currentAmount / target) * 100)) : 0;
      const reached = highestReached(pct);
      const stored = Number(g.milestones_reached ?? 0);
      return reached > stored ? { id: g.id as string, title: g.title as string, to: reached, pct } : null;
    })
    .filter((x): x is { id: string; title: string; to: number; pct: number } => x !== null);

  if (dueNotifs.length > 0) {
    const notifRows = dueNotifs.map((n) => {
      const m = MILESTONES[n.to - 1];
      const label =
        m === 100 ? "Goal completed" : m === 50 ? "Halfway there" : `${m}% milestone reached`;
      const labelUr =
        m === 100 ? "ہدف مکمل" : m === 50 ? "آدھا راستہ طے ہو گیا" : `${m}% سنگ میل حاصل`;
      return {
        user_id: userId,
        title: label,
        title_ur: labelUr,
        message: `Goal "${n.title}" is at ${n.pct}% of its target.`,
        message_ur: `ہدف "${n.title}" اپنے ہدف کے ${n.pct}% تک پہنچ گیا ہے۔`,
        is_read: false,
      };
    });
    // Best-effort — never block the goals response on notification inserts,
    // but log failures so silent notification loss is visible to operators.
    const { error: milestoneNotifError } = await supabase
      .from("notifications")
      .insert(notifRows);
    if (milestoneNotifError) {
      logServerWarn("goals", milestoneNotifError, "milestone notification insert failed");
    }
    const milestoneUpdates = await Promise.all(
      dueNotifs.map((n) =>
        supabase.from("goals").update({ milestones_reached: n.to }).eq("id", n.id).eq("user_id", userId)
      )
    );
    for (const u of milestoneUpdates) {
      if (u.error) {
        // If the counter update fails, the milestone may re-notify on the
        // next load — surface it instead of failing silently.
        logServerWarn("goals", u.error, "milestones_reached counter update failed");
      }
    }
  }

  return NextResponse.json({ goals, current_amount: currentAmount });
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = user.id;

  let body: { title?: unknown; target_amount?: unknown; target_date?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ---- Validation (server-side, mirrors the client checks) ----
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 80) {
    return NextResponse.json({ error: "Goal title is required (max 80 characters)." }, { status: 400 });
  }

  const targetNum = Number(body.target_amount);
  if (!Number.isFinite(targetNum) || targetNum <= 0) {
    return NextResponse.json({ error: "Target amount must be a positive number." }, { status: 400 });
  }
  if (targetNum > 100000000) {
    return NextResponse.json({ error: "Target amount is too large." }, { status: 400 });
  }

  let targetDate: string | null = null;
  if (body.target_date != null && body.target_date !== "") {
    const d = new Date(String(body.target_date));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Target date is invalid." }, { status: 400 });
    }
    targetDate = String(body.target_date).slice(0, 10);
  }

  let description: string | null = null;
  if (body.description != null && String(body.description).trim() !== "") {
    const desc = String(body.description).trim();
    if (desc.length > 500) {
      return NextResponse.json({ error: "Description is too long (max 500 characters)." }, { status: 400 });
    }
    description = desc;
  }

  const supabase = await createClient();
  const { data, error: insertError } = await supabase
    .from("goals")
    .insert({ user_id: userId, title, target_amount: targetNum, target_date: targetDate, description })
    .select("id, title, target_amount, target_date, description, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "42P01") {
      return NextResponse.json({ error: "Goals are not available yet. Please try again later.", setup_pending: true }, { status: 503 });
    }
    const info = extractErrorInfo(insertError, "Could not create the goal.");
    const status = insertError.code === "23514" || insertError.code === "22P02" ? 400 : 500;
    return NextResponse.json({ error: info.friendly }, { status });
  }

  return NextResponse.json({ goal: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = user.id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // ownership enforced server-side

  if (deleteError) {
    if (deleteError.code === "42P01") {
      return NextResponse.json({ error: "Goals are not available yet. Please try again later.", setup_pending: true }, { status: 503 });
    }
    const info = extractErrorInfo(deleteError, "Could not delete the goal.");
    return NextResponse.json({ error: info.friendly }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

