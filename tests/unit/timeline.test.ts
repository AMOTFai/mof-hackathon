import { describe, expect, it } from "vitest";
import { activityByDay, buildTimeline, summarize } from "@/lib/timeline/merge";
import type { CheckInEntry } from "@/lib/checkins/queries";
import type { CommitEntry } from "@/lib/github/queries";
import type { ApiCallEntry } from "@/lib/proxy/queries";

function checkIn(id: string, createdAt: string): CheckInEntry {
  return {
    id,
    teamId: "t1",
    authorId: "u1",
    authorName: "Ada",
    milestoneId: null,
    milestoneLabel: null,
    body: `check-in ${id}`,
    linkUrl: null,
    blockers: null,
    createdAt,
  };
}

function commit(id: string, authoredAt: string): CommitEntry {
  return {
    id,
    sha: `sha-${id}`,
    message: `commit ${id}`,
    authorLogin: "ada",
    authoredAt,
    additions: 10,
    deletions: 2,
    filesChanged: 3,
  };
}

function apiCall(id: string, createdAt: string): ApiCallEntry {
  return {
    id,
    provider: "openai",
    model: "gpt-4o-mini",
    requestTokens: 10,
    responseTokens: 5,
    latencyMs: 200,
    statusCode: 200,
    createdAt,
  };
}

describe("buildTimeline", () => {
  it("interleaves check-ins and commits newest-first", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-20T10:00:00Z"), checkIn("b", "2026-08-20T14:00:00Z")],
      commits: [commit("x", "2026-08-20T12:00:00Z"), commit("y", "2026-08-20T16:00:00Z")],
    });
    expect(events.map((e) => `${e.kind}:${e.at}`)).toEqual([
      "commit:2026-08-20T16:00:00Z",
      "check-in:2026-08-20T14:00:00Z",
      "commit:2026-08-20T12:00:00Z",
      "check-in:2026-08-20T10:00:00Z",
    ]);
  });

  it("interleaves api calls with check-ins and commits on the same axis", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-20T10:00:00Z")],
      commits: [commit("x", "2026-08-20T14:00:00Z")],
      apiCalls: [apiCall("p", "2026-08-20T12:00:00Z")],
    });
    expect(events.map((e) => e.kind)).toEqual(["commit", "api-call", "check-in"]);
  });

  it("namespaces ids so a check-in and a commit sharing a raw id do not collide", () => {
    const events = buildTimeline({
      checkIns: [checkIn("same", "2026-08-20T10:00:00Z")],
      commits: [commit("same", "2026-08-20T11:00:00Z")],
    });
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("orders deterministically when timestamps tie", () => {
    const at = "2026-08-20T10:00:00Z";
    const first = buildTimeline({ checkIns: [checkIn("a", at)], commits: [commit("z", at)] });
    const second = buildTimeline({ commits: [commit("z", at)], checkIns: [checkIn("a", at)] });
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
  });

  it("handles empty and partial sources", () => {
    expect(buildTimeline({})).toEqual([]);
    expect(buildTimeline({ checkIns: [checkIn("a", "2026-08-20T10:00:00Z")] })).toHaveLength(1);
    expect(buildTimeline({ commits: [commit("x", "2026-08-20T10:00:00Z")] })).toHaveLength(1);
  });
});

describe("activityByDay", () => {
  it("counts per day, oldest first", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-19T10:00:00Z"), checkIn("b", "2026-08-20T09:00:00Z")],
      commits: [
        commit("x", "2026-08-20T12:00:00Z"),
        commit("y", "2026-08-20T13:00:00Z"),
        commit("z", "2026-08-21T08:00:00Z"),
      ],
    });
    expect(activityByDay(events)).toEqual([
      { date: "2026-08-19", checkIns: 1, commits: 0, apiCalls: 0 },
      { date: "2026-08-20", checkIns: 1, commits: 2, apiCalls: 0 },
      { date: "2026-08-21", checkIns: 0, commits: 1, apiCalls: 0 },
    ]);
  });

  it("counts api-call days alongside check-ins and commits", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-19T10:00:00Z")],
      commits: [commit("x", "2026-08-19T11:00:00Z")],
      apiCalls: [apiCall("p", "2026-08-19T12:00:00Z"), apiCall("q", "2026-08-20T09:00:00Z")],
    });
    expect(activityByDay(events)).toEqual([
      { date: "2026-08-19", checkIns: 1, commits: 1, apiCalls: 1 },
      { date: "2026-08-20", checkIns: 0, commits: 0, apiCalls: 1 },
    ]);
  });
});

describe("summarize", () => {
  it("reports totals, active days and the span", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-19T10:00:00Z")],
      commits: [commit("x", "2026-08-20T12:00:00Z"), commit("y", "2026-08-21T08:00:00Z")],
    });
    expect(summarize(events)).toEqual({
      totalCheckIns: 1,
      totalCommits: 2,
      totalApiCalls: 0,
      activeDays: 3,
      firstAt: "2026-08-19T10:00:00Z",
      lastAt: "2026-08-21T08:00:00Z",
    });
  });

  it("counts api calls in the totals and the span", () => {
    const events = buildTimeline({
      checkIns: [checkIn("a", "2026-08-19T10:00:00Z")],
      apiCalls: [apiCall("p", "2026-08-18T09:00:00Z"), apiCall("q", "2026-08-22T09:00:00Z")],
    });
    const summary = summarize(events);
    expect(summary.totalApiCalls).toBe(2);
    expect(summary.firstAt).toBe("2026-08-18T09:00:00Z");
    expect(summary.lastAt).toBe("2026-08-22T09:00:00Z");
  });

  it("is null-safe on an empty timeline", () => {
    expect(summarize([])).toEqual({
      totalCheckIns: 0,
      totalCommits: 0,
      totalApiCalls: 0,
      activeDays: 0,
      firstAt: null,
      lastAt: null,
    });
  });
});
