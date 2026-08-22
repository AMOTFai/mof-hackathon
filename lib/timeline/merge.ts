import type { CheckInEntry } from "@/lib/checkins/queries";
import type { CommitEntry } from "@/lib/github/queries";
import type { ApiCallEntry } from "@/lib/proxy/queries";

/**
 * One unified, reverse-chronological stream of everything a team did.
 *
 * This is the product: judges assess the journey, not just the artifact, and a
 * build story is only legible if check-ins, commits, and AI calls sit on the
 * SAME axis. Do not start a second timeline for a new signal — add a variant.
 */
export type TimelineEvent =
  | { kind: "check-in"; id: string; at: string; data: CheckInEntry }
  | { kind: "commit"; id: string; at: string; data: CommitEntry }
  | { kind: "api-call"; id: string; at: string; data: ApiCallEntry };

export type TimelineSource = {
  checkIns?: CheckInEntry[];
  commits?: CommitEntry[];
  apiCalls?: ApiCallEntry[];
};

export function buildTimeline(source: TimelineSource): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...(source.checkIns ?? []).map(
      (c): TimelineEvent => ({ kind: "check-in", id: `check-in:${c.id}`, at: c.createdAt, data: c }),
    ),
    ...(source.commits ?? []).map(
      (c): TimelineEvent => ({ kind: "commit", id: `commit:${c.id}`, at: c.authoredAt, data: c }),
    ),
    ...(source.apiCalls ?? []).map(
      (c): TimelineEvent => ({ kind: "api-call", id: `api-call:${c.id}`, at: c.createdAt, data: c }),
    ),
  ];

  return events.sort((a, b) => {
    const delta = new Date(b.at).getTime() - new Date(a.at).getTime();
    // Stable tiebreak: two events can share a timestamp, and an unstable order
    // would make the timeline shuffle between renders.
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

export type ActivityDay = { date: string; checkIns: number; commits: number; apiCalls: number };

/** Per-day activity counts, oldest first — shows whether work was steady or crammed. */
export function activityByDay(events: TimelineEvent[]): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  for (const event of events) {
    const date = event.at.slice(0, 10);
    const day = days.get(date) ?? { date, checkIns: 0, commits: 0, apiCalls: 0 };
    if (event.kind === "check-in") day.checkIns += 1;
    else if (event.kind === "commit") day.commits += 1;
    else day.apiCalls += 1;
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ProcessSummary = {
  totalCheckIns: number;
  totalCommits: number;
  totalApiCalls: number;
  activeDays: number;
  firstAt: string | null;
  lastAt: string | null;
};

export function summarize(events: TimelineEvent[]): ProcessSummary {
  const checkIns = events.filter((e) => e.kind === "check-in").length;
  const commits = events.filter((e) => e.kind === "commit").length;
  const apiCalls = events.length - checkIns - commits;
  return {
    totalCheckIns: checkIns,
    totalCommits: commits,
    totalApiCalls: apiCalls,
    activeDays: activityByDay(events).length,
    // events are newest-first.
    firstAt: events[events.length - 1]?.at ?? null,
    lastAt: events[0]?.at ?? null,
  };
}
