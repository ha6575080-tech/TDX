export function calculateProfitCycle(anchorMs: number | null, nowMs = Date.now()) {
  if (anchorMs == null || !Number.isFinite(anchorMs) || !Number.isFinite(nowMs)) return null;
  const day = 86400000;
  const index = Math.max(0, Math.floor((nowMs - anchorMs) / (30 * day)));
  const start = anchorMs + index * 30 * day;
  const end = start + 30 * day;
  if (!Number.isFinite(new Date(end).getTime())) return null;
  return { cycleNumber: index + 1, cycleStart: new Date(start).toISOString(), cycleEnd: new Date(end).toISOString(), actionableAt: new Date(end - day).toISOString(), actionableNow: nowMs >= end - day };
}
