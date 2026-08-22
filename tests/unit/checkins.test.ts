import { describe, expect, it } from "vitest";
import { createCheckInSchema } from "@/lib/validation/checkin";
import {
  isDisqualifyRisk,
  isPlateCapped,
  milestonesWithStatus,
  statusFor,
  type MilestoneDef,
} from "@/lib/checkins/status";

const NOW = new Date("2026-08-20T12:00:00Z");

function milestone(overrides: Partial<MilestoneDef> = {}): MilestoneDef {
  return {
    id: "m1",
    key: "v1_slice",
    label: "V1 slice",
    dueAt: "2026-08-20T12:00:00Z",
    required: true,
    penalty: "plate_cap",
    sortOrder: 1,
    ...overrides,
  };
}

describe("milestone status derivation", () => {
  it("is hit when a check-in lands before the deadline", () => {
    const m = milestone({ dueAt: "2026-08-20T18:00:00Z" });
    const status = statusFor(m, [{ milestoneId: "m1", createdAt: "2026-08-20T10:00:00Z" }], NOW);
    expect(status).toBe("hit");
  });

  it("is late when a check-in lands after the deadline", () => {
    const m = milestone({ dueAt: "2026-08-20T06:00:00Z" });
    const status = statusFor(m, [{ milestoneId: "m1", createdAt: "2026-08-20T09:00:00Z" }], NOW);
    expect(status).toBe("late");
  });

  it("is missed once the deadline passes with no check-in", () => {
    const m = milestone({ dueAt: "2026-08-20T06:00:00Z" });
    expect(statusFor(m, [], NOW)).toBe("missed");
  });

  it("is due-soon inside the 12h window", () => {
    const m = milestone({ dueAt: "2026-08-20T20:00:00Z" });
    expect(statusFor(m, [], NOW)).toBe("due-soon");
  });

  it("is pending well before the deadline", () => {
    const m = milestone({ dueAt: "2026-08-25T00:00:00Z" });
    expect(statusFor(m, [], NOW)).toBe("pending");
  });

  it("ignores check-ins tied to a different milestone", () => {
    const m = milestone({ id: "m1", dueAt: "2026-08-20T06:00:00Z" });
    expect(statusFor(m, [{ milestoneId: "other", createdAt: "2026-08-20T01:00:00Z" }], NOW)).toBe("missed");
  });

  it("sorts milestones by sort_order", () => {
    const defs = [milestone({ id: "b", sortOrder: 2 }), milestone({ id: "a", sortOrder: 1 })];
    const result = milestonesWithStatus(defs, [], NOW);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("plate cap and disqualification", () => {
  it("caps the team when a plate_cap milestone is missed", () => {
    const defs = [milestone({ penalty: "plate_cap", dueAt: "2026-08-20T06:00:00Z" })];
    expect(isPlateCapped(defs, [], NOW)).toBe(true);
  });

  it("still caps the team when the plate_cap milestone is only late — no redemption by lateness", () => {
    const defs = [milestone({ penalty: "plate_cap", dueAt: "2026-08-20T06:00:00Z" })];
    const recs = [{ milestoneId: "m1", createdAt: "2026-08-20T09:00:00Z" }];
    expect(isPlateCapped(defs, recs, NOW)).toBe(true);
  });

  it("does not cap when the plate_cap milestone is hit", () => {
    const defs = [milestone({ penalty: "plate_cap", dueAt: "2026-08-20T18:00:00Z" })];
    const recs = [{ milestoneId: "m1", createdAt: "2026-08-20T10:00:00Z" }];
    expect(isPlateCapped(defs, recs, NOW)).toBe(false);
  });

  it("flags disqualify risk only on a missed disqualify milestone", () => {
    const defs = [milestone({ penalty: "disqualify", dueAt: "2026-08-20T06:00:00Z" })];
    expect(isDisqualifyRisk(defs, [], NOW)).toBe(true);
    expect(isDisqualifyRisk([milestone({ penalty: "flag", dueAt: "2026-08-20T06:00:00Z" })], [], NOW)).toBe(false);
  });
});

describe("check-in validation", () => {
  it("rejects an empty body", () => {
    const parsed = createCheckInSchema.safeParse({ teamId: "00000000-0000-4000-8000-000000000010", body: "   " });
    expect(parsed.success).toBe(false);
  });

  it("normalizes an empty milestoneId to null", () => {
    const parsed = createCheckInSchema.parse({
      teamId: "00000000-0000-4000-8000-000000000010",
      milestoneId: "",
      body: "Shipped the login flow",
    });
    expect(parsed.milestoneId).toBeNull();
  });

  it("rejects a malformed link URL", () => {
    const parsed = createCheckInSchema.safeParse({
      teamId: "00000000-0000-4000-8000-000000000010",
      body: "Shipped it",
      linkUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a javascript: URI (stored-XSS via a clicked check-in link)", () => {
    const parsed = createCheckInSchema.safeParse({
      teamId: "00000000-0000-4000-8000-000000000010",
      body: "Shipped it",
      linkUrl: "javascript:alert(document.domain)",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a data: URI", () => {
    const parsed = createCheckInSchema.safeParse({
      teamId: "00000000-0000-4000-8000-000000000010",
      body: "Shipped it",
      linkUrl: "data:text/html,<script>alert(1)</script>",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed check-in", () => {
    const parsed = createCheckInSchema.parse({
      teamId: "00000000-0000-4000-8000-000000000010",
      body: "  Shipped the login flow  ",
      linkUrl: "https://github.com/team/repo/pull/1",
      blockers: "",
    });
    expect(parsed.body).toBe("Shipped the login flow");
    expect(parsed.blockers).toBeNull();
  });
});
