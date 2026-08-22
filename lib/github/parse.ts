export type RepoRef = { owner: string; repo: string };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

// GitHub's own rules: owners are alphanumeric with single hyphens; repo names
// allow alphanumerics, hyphen, underscore, period. Anchored, so a segment
// containing "..", "/", "?" or "%2e" can never reach the API URL we build.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Strict parse of a user-supplied GitHub repo URL.
 *
 * Host is checked via URL parsing against an allowlist — NOT a substring match.
 * A regex like /github\.com\/([^/]+)/ also matches
 * `https://evil.internal/github.com/a/b`, which is how a repo field turns into
 * an SSRF primitive. Returns null on anything that isn't plainly a GitHub repo.
 */
export function parseRepo(input: string | null | undefined): RepoRef | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
  // Credentials in the URL are a smell and never needed for a public repo.
  if (url.username || url.password) return null;

  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  const [rawOwner, rawRepo] = segments;
  if (!rawOwner || !rawRepo) return null;

  let owner: string;
  let repo: string;
  try {
    owner = decodeURIComponent(rawOwner);
    repo = decodeURIComponent(rawRepo).replace(/\.git$/i, "");
  } catch {
    // Malformed percent-encoding.
    return null;
  }

  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  // "." and ".." are valid against REPO_RE's charset but are path traversal.
  if (repo === "." || repo === "..") return null;

  return { owner, repo };
}

/** Canonical https URL for a parsed ref — safe to render in an href. */
export function repoWebUrl(ref: RepoRef): string {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}

export function commitWebUrl(ref: RepoRef, sha: string): string {
  return `${repoWebUrl(ref)}/commit/${encodeURIComponent(sha)}`;
}
