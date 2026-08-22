import { describe, expect, it } from "vitest";
import { scheduleItemSchema } from "@/lib/validation/schedule";
import { announcementSchema, teamMessageSchema } from "@/lib/validation/messages";

describe("schedule validation", () => {
  it("accepts a session and converts datetimes to ISO", () => {
    const parsed = scheduleItemSchema.parse({
      eventId: "00000000-0000-4000-8000-000000000010",
      title: "Kickoff",
      kind: "session",
      starts_at: "2026-08-20T10:00",
      ends_at: "2026-08-20T11:00",
      location: "Hall A",
      description: "",
    });
    expect(parsed.title).toBe("Kickoff");
    expect(parsed.starts_at).toMatch(/Z$/);
    expect(parsed.ends_at).toMatch(/Z$/);
    expect(parsed.location).toBe("Hall A");
    expect(parsed.description).toBeNull();
  });

  it("rejects an end before the start", () => {
    const parsed = scheduleItemSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000010",
      title: "Kickoff",
      kind: "session",
      starts_at: "2026-08-20T12:00",
      ends_at: "2026-08-20T11:00",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("message validation", () => {
  it("trims team chat bodies", () => {
    const parsed = teamMessageSchema.parse({
      eventId: "00000000-0000-4000-8000-000000000010",
      teamId: "00000000-0000-4000-8000-000000000099",
      body: "  hello  ",
    });
    expect(parsed.body).toBe("hello");
  });

  it("rejects empty announcements", () => {
    const parsed = announcementSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000010",
      body: "   ",
    });
    expect(parsed.success).toBe(false);
  });
});
