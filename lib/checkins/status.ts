import type { MilestoneStatus } from "@/lib/enums";

export type MilestoneDef = {
  id: string;
  key: string;
  label: string;
  dueAt: string;
  required: boolean;
  penalty: "none" | "flag" | "plate_cap" | "disqualify";
  sortOrder: number;
};

export type CheckInRec = { milestoneId: string | null; createdAt: string };

export type ComputedStatus = MilestoneStatus | "pending" | "due-soon";

const DUE_SOON_WINDOW_MS = 12 * 3_600_000;

/** First check-in linked to a milestone counts as satisfying it. */
function firstCheckInFor(milestoneId: string, checkIns: CheckInRec[]): CheckInRec | undefined {
  return checkIns
    .filter((c) => c.milestoneId === milestoneId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
}

export function statusFor(def: MilestoneDef, checkIns: CheckInRec[], now = new Date()): ComputedStatus {
  const rec = firstCheckInFor(def.id, checkIns);
  const dueAt = new Date(def.dueAt).getTime();
  if (rec) return new Date(rec.createdAt).getTime() <= dueAt ? "hit" : "late";
  if (now.getTime() > dueAt) return "missed";
  if (dueAt - now.getTime() < DUE_SOON_WINDOW_MS) return "due-soon";
  return "pending";
}

export type MilestoneWithStatus = MilestoneDef & { status: ComputedStatus };

export function milestonesWithStatus(
  defs: MilestoneDef[],
  checkIns: CheckInRec[],
  now = new Date(),
): MilestoneWithStatus[] {
  return [...defs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((def) => ({ ...def, status: statusFor(def, checkIns, now) }));
}

/**
 * A late submission cannot redeem a plate_cap milestone — the cap is a
 * consequence of missing the deadline, so "late" still caps the team.
 */
export function isPlateCapped(defs: MilestoneDef[], checkIns: CheckInRec[], now = new Date()): boolean {
  return defs.some((d) => {
    if (d.penalty !== "plate_cap") return false;
    const status = statusFor(d, checkIns, now);
    return status === "missed" || status === "late";
  });
}

export function isDisqualifyRisk(defs: MilestoneDef[], checkIns: CheckInRec[], now = new Date()): boolean {
  return defs.some((d) => d.penalty === "disqualify" && statusFor(d, checkIns, now) === "missed");
}

export const STATUS_META: Record<ComputedStatus, { label: string; tone: string }> = {
  hit: { label: "Hit", tone: "text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-400/40 dark:bg-emerald-400/10" },
  late: { label: "Late", tone: "text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-400/40 dark:bg-amber-400/10" },
  missed: { label: "Missed", tone: "text-rose-700 border-rose-300 bg-rose-50 dark:text-rose-300 dark:border-rose-400/40 dark:bg-rose-400/10" },
  pending: { label: "Pending", tone: "text-muted-foreground border-border bg-muted" },
  "due-soon": { label: "Due soon", tone: "text-cyan-700 border-cyan-300 bg-cyan-50 dark:text-cyan-200 dark:border-cyan-400/40 dark:bg-cyan-400/10" },
};
