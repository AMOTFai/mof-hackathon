import { describe, expect, it } from "vitest";
import { submitTeamSchema, updateTeamSchema } from "@/lib/validation/team";
import { isPastDeadline, isSubmissionReady, missingSubmissionFields } from "@/lib/submission/readiness";

const TEAM_ID = "00000000-0000-4000-8000-000000000010";

describe("submission readiness", () => {
  it("lists every missing field on an empty team", () => {
    const missing = missingSubmissionFields({ projectName: null, repoUrl: null, videoUrl: null });
    expect(missing).toEqual(["project name", "repo URL", "demo video URL"]);
  });

  it("is ready when project, repo and video are all valid", () => {
    const team = {
      projectName: "Aurora",
      repoUrl: "https://github.com/team/repo",
      videoUrl: "https://youtube.com/watch?v=x",
    };
    expect(missingSubmissionFields(team)).toEqual([]);
    expect(isSubmissionReady(team)).toBe(true);
  });

  it("treats a whitespace-only project name as missing", () => {
    const missing = missingSubmissionFields({
      projectName: "   ",
      repoUrl: "https://github.com/team/repo",
      videoUrl: "https://youtube.com/watch?v=x",
    });
    expect(missing).toEqual(["project name"]);
  });

  it("rejects a non-http URL scheme as not-ready", () => {
    const missing = missingSubmissionFields({
      projectName: "Aurora",
      repoUrl: "javascript:alert(1)",
      videoUrl: "ftp://example.com/demo.mp4",
    });
    expect(missing).toEqual(["repo URL", "demo video URL"]);
  });

  it("detects a passed deadline", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    expect(isPastDeadline("2026-08-20T11:59:59Z", now)).toBe(true);
    expect(isPastDeadline("2026-08-20T12:00:01Z", now)).toBe(false);
  });
});

describe("submission validation", () => {
  it("requires a uuid idempotency key", () => {
    expect(submitTeamSchema.safeParse({ teamId: TEAM_ID, idempotencyKey: "not-a-uuid" }).success).toBe(false);
    expect(
      submitTeamSchema.safeParse({ teamId: TEAM_ID, idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }).success,
    ).toBe(true);
  });

  it("rejects a javascript: repo URL on team update", () => {
    const parsed = updateTeamSchema.safeParse({
      teamId: TEAM_ID,
      name: "Aurora",
      repo_url: "javascript:alert(document.domain)",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts and normalizes blank submission URLs to null", () => {
    const parsed = updateTeamSchema.parse({
      teamId: TEAM_ID,
      name: "Aurora",
      repo_url: "",
      video_url: "  ",
    });
    expect(parsed.repo_url).toBeNull();
    expect(parsed.video_url).toBeNull();
  });

  it("keeps valid https submission URLs", () => {
    const parsed = updateTeamSchema.parse({
      teamId: TEAM_ID,
      name: "Aurora",
      repo_url: "https://github.com/team/repo",
      video_url: "https://youtu.be/abc",
    });
    expect(parsed.repo_url).toBe("https://github.com/team/repo");
    expect(parsed.video_url).toBe("https://youtu.be/abc");
  });
});
