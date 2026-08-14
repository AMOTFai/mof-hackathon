// Checkpoint status logic. A team is measured against each event-level deadline.

export type CheckpointDef = {
  id: string;
  key: string;
  label: string;
  requirement: string;
  dueAt: Date;
  order: number;
  requiresText: boolean;
  autoPlateCap: boolean;
  disqualifies: boolean;
};

export type TeamCheckpointRec = { checkpointId: string; content: string | null; submittedAt: Date };

export type CheckpointStatus = "hit" | "late" | "missed" | "pending" | "due-soon";

export function statusFor(def: CheckpointDef, rec: TeamCheckpointRec | undefined, now = new Date()): CheckpointStatus {
  if (rec) return rec.submittedAt.getTime() <= def.dueAt.getTime() ? "hit" : "late";
  if (now.getTime() > def.dueAt.getTime()) return "missed";
  // Within 12h of the deadline and not yet submitted.
  if (def.dueAt.getTime() - now.getTime() < 12 * 3_600_000) return "due-soon";
  return "pending";
}

// A team is Plate-capped if it missed OR was late on any autoPlateCap checkpoint
// (Wed V1 slice). The cap is a consequence of missing the deadline, so a late
// submission cannot redeem it — otherwise a team games the cap by submitting a day late.
export function isPlateCapped(defs: CheckpointDef[], recs: TeamCheckpointRec[], now = new Date()): boolean {
  return defs.some((d) => {
    if (!d.autoPlateCap) return false;
    const st = statusFor(d, recs.find((r) => r.checkpointId === d.id), now);
    return st === "missed" || st === "late";
  });
}

// Single source of truth for a team's bracket everywhere in the UI + exports.
// A cap forces Plate regardless of the stored bracket.
export function effectiveBracket(storedBracket: string, capped: boolean): string {
  return capped ? "plate" : storedBracket;
}

// Is a team disqualified? (missed the final-submission checkpoint)
export function isDisqualified(defs: CheckpointDef[], recs: TeamCheckpointRec[], now = new Date()): boolean {
  return defs.some(
    (d) => d.disqualifies && statusFor(d, recs.find((r) => r.checkpointId === d.id), now) === "missed",
  );
}

export function nextDue(defs: CheckpointDef[], recs: TeamCheckpointRec[], now = new Date()): CheckpointDef | null {
  return (
    defs
      .filter((d) => !recs.some((r) => r.checkpointId === d.id) && d.dueAt.getTime() > now.getTime())
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null
  );
}

export const STATUS_META: Record<CheckpointStatus, { label: string; tone: string }> = {
  hit: { label: "Hit", tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" },
  late: { label: "Late", tone: "text-amber-300 border-amber-400/40 bg-amber-400/10" },
  missed: { label: "Missed", tone: "text-rose-300 border-rose-400/40 bg-rose-400/10" },
  pending: { label: "Pending", tone: "text-slate-300 border-white/15 bg-white/5" },
  "due-soon": { label: "Due soon", tone: "text-cyan-200 border-cyan-400/40 bg-cyan-400/10" },
};
