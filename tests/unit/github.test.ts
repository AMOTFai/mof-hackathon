import { describe, expect, it } from "vitest";
import { commitWebUrl, parseRepo, repoWebUrl } from "@/lib/github/parse";

describe("parseRepo — accepts real GitHub URLs", () => {
  const cases: [string, string, string][] = [
    ["https://github.com/motf/aurora", "motf", "aurora"],
    ["http://github.com/motf/aurora", "motf", "aurora"],
    ["https://www.github.com/motf/aurora", "motf", "aurora"],
    ["https://github.com/motf/aurora.git", "motf", "aurora"],
    ["https://github.com/motf/aurora/", "motf", "aurora"],
    ["https://github.com/motf/aurora/tree/main/src", "motf", "aurora"],
    ["https://github.com/motf/aurora?tab=readme", "motf", "aurora"],
    ["https://GitHub.com/motf/aurora", "motf", "aurora"],
    ["  https://github.com/motf/aurora  ", "motf", "aurora"],
    ["https://github.com/a-b-c/my_repo.v2", "a-b-c", "my_repo.v2"],
  ];

  for (const [input, owner, repo] of cases) {
    it(`parses ${input}`, () => {
      expect(parseRepo(input)).toEqual({ owner, repo });
    });
  }
});

describe("parseRepo — rejects everything else", () => {
  const bad = [
    // The classic substring-match bug: host is NOT github.com.
    "https://evil.example.com/github.com/motf/aurora",
    "https://github.com.evil.example.com/motf/aurora",
    "https://notgithub.com/motf/aurora",
    // SSRF targets.
    "http://localhost/motf/aurora",
    "http://127.0.0.1:8080/motf/aurora",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/motf/aurora",
    // Non-http schemes.
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "git@github.com:motf/aurora.git",
    "ssh://git@github.com/motf/aurora",
    // Credentials embedded.
    "https://user:pass@github.com/motf/aurora",
    // Incomplete paths.
    "https://github.com/motf",
    "https://github.com/",
    "https://github.com",
    // Path traversal / encoding tricks in the segments we interpolate.
    "https://github.com/motf/..",
    "https://github.com/motf/.",
    "https://github.com/%2e%2e/%2e%2e",
    "https://github.com/motf/aurora%2f..%2fother",
    "https://github.com/mo tf/aurora",
    // Junk.
    "",
    "   ",
    "not a url",
    null,
    undefined,
  ];

  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseRepo(input as string)).toBeNull();
    });
  }

  it("rejects an over-long input", () => {
    expect(parseRepo(`https://github.com/motf/${"a".repeat(3000)}`)).toBeNull();
  });

  it("rejects an owner starting or ending with a hyphen", () => {
    expect(parseRepo("https://github.com/-motf/aurora")).toBeNull();
    expect(parseRepo("https://github.com/motf-/aurora")).toBeNull();
  });

  // Dot segments are resolved by the URL parser BEFORE we read the path, so
  // traversal collapses into an ordinary (nonexistent) github.com path rather
  // than escaping the host. Documented because it looks alarming but is inert:
  // the worst case is a 404 from api.github.com/repos/etc/passwd.
  it("normalizes dot segments instead of letting them escape the host", () => {
    expect(parseRepo("https://github.com/../../etc/passwd")).toEqual({ owner: "etc", repo: "passwd" });
    expect(parseRepo("https://github.com/motf/aurora/../../other/repo")).toEqual({ owner: "other", repo: "repo" });
  });
});

describe("URL builders only ever emit canonical github.com links", () => {
  it("builds a repo URL", () => {
    expect(repoWebUrl({ owner: "motf", repo: "aurora" })).toBe("https://github.com/motf/aurora");
  });

  it("builds a commit URL and encodes the sha", () => {
    expect(commitWebUrl({ owner: "motf", repo: "aurora" }, "abc123")).toBe(
      "https://github.com/motf/aurora/commit/abc123",
    );
    expect(commitWebUrl({ owner: "motf", repo: "aurora" }, "a/../b")).toBe(
      "https://github.com/motf/aurora/commit/a%2F..%2Fb",
    );
  });
});
