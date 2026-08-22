import { describe, expect, it } from "vitest";
import { isLastCaptain, mapTeamWriteError } from "@/lib/teams/membership";
import { createTeamSchema, joinTeamSchema } from "@/lib/validation/team";
import { profileUpdateSchema } from "@/lib/validation/profile";

describe("team membership helpers", () => {
  it("detects the last captain", () => {
    const roster = [
      { user_id: "a", role: "captain" },
      { user_id: "b", role: "member" },
    ];
    expect(isLastCaptain(roster, "a")).toBe(true);
    expect(isLastCaptain(roster, "b")).toBe(false);
    expect(isLastCaptain([...roster, { user_id: "c", role: "captain" }], "a")).toBe(false);
  });

  it("maps full-team and duplicate-name errors", () => {
    expect(mapTeamWriteError("team is full (max 2)")).toBe("This team is full (max 2).");
    expect(mapTeamWriteError('duplicate key value violates unique constraint "teams_event_id_name_key"')).toBe(
      "A team with that name already exists in this event.",
    );
  });
});

describe("team validation", () => {
  it("normalizes invite codes", () => {
    const parsed = joinTeamSchema.parse({ eventId: "00000000-0000-4000-8000-000000000020", inviteCode: "  AbCdEf12 " });
    expect(parsed.inviteCode).toBe("abcdef12");
  });

  it("rejects short team names", () => {
    const parsed = createTeamSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000020",
      name: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("profile validation", () => {
  it("parses skills and empty graduation year", () => {
    const parsed = profileUpdateSchema.parse({
      full_name: "Alex",
      university: "",
      course: "",
      grad_year: "",
      bio: "",
      skills: "TypeScript,  product, ",
      github_username: "",
      timezone: "Europe/London",
    });
    expect(parsed.full_name).toBe("Alex");
    expect(parsed.university).toBeNull();
    expect(parsed.grad_year).toBeNull();
    expect(parsed.skills).toEqual(["TypeScript", "product"]);
    expect(parsed.github_username).toBeNull();
  });
});
