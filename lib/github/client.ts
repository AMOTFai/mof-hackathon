import { parseRepo, type RepoRef } from "@/lib/github/parse";

export type FetchedCommit = {
  sha: string;
  message: string | null;
  authorLogin: string | null;
  authoredAt: string;
  additions: number | null;
  deletions: number | null;
  filesChanged: number | null;
};

export type FetchResult =
  | { ok: true; commits: FetchedCommit[] }
  | { ok: false; reason: "bad-url" | "not-found" | "rate-limited" | "unreachable"; message: string };

const API = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "minds-of-the-future",
  };
  // Optional: raises the rate limit. The app works without it.
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

type ApiCommit = {
  sha?: unknown;
  commit?: { message?: unknown; author?: { name?: unknown; date?: unknown }; committer?: { date?: unknown } };
  author?: { login?: unknown } | null;
  stats?: { additions?: unknown; deletions?: unknown };
  files?: unknown[];
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapCommit(raw: ApiCommit): FetchedCommit | null {
  const sha = str(raw.sha);
  if (!sha) return null;
  const rawMessage = str(raw.commit?.message);
  return {
    sha,
    // First line only, bounded — commit messages are attacker-controlled text.
    message: rawMessage ? (rawMessage.split("\n")[0] ?? "").slice(0, 300) : null,
    authorLogin: str(raw.author?.login) ?? str(raw.commit?.author?.name),
    authoredAt: str(raw.commit?.author?.date) ?? str(raw.commit?.committer?.date) ?? new Date().toISOString(),
    additions: num(raw.stats?.additions),
    deletions: num(raw.stats?.deletions),
    filesChanged: Array.isArray(raw.files) ? raw.files.length : null,
  };
}

/**
 * Recent commits for a repo. Never throws — the caller (a participant clicking
 * "sync", or cron) must degrade gracefully when a repo is private, renamed, or
 * GitHub is rate-limiting us.
 *
 * The list endpoint does not return per-commit stats (additions/deletions/files),
 * so those stay null unless `enrich` is set, which costs one extra request per
 * commit and is therefore capped.
 */
export async function fetchCommits(
  repoUrl: string,
  opts: { limit?: number; enrich?: number; signal?: AbortSignal } = {},
): Promise<FetchResult> {
  const ref = parseRepo(repoUrl);
  if (!ref) return { ok: false, reason: "bad-url", message: "Not a recognized GitHub repository URL." };

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 100);
  const url = `${API}/repos/${ref.owner}/${ref.repo}/commits?per_page=${limit}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: headers(), cache: "no-store", signal: opts.signal });
  } catch (err) {
    return { ok: false, reason: "unreachable", message: err instanceof Error ? err.message : "Network error" };
  }

  if (res.status === 404) {
    return { ok: false, reason: "not-found", message: "Repository not found, or it is private." };
  }
  if (res.status === 403 || res.status === 429) {
    return {
      ok: false,
      reason: "rate-limited",
      message: "GitHub is rate-limiting us. Set GITHUB_TOKEN or try again shortly.",
    };
  }
  if (!res.ok) {
    return { ok: false, reason: "unreachable", message: `GitHub returned ${res.status}.` };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, reason: "unreachable", message: "Malformed response from GitHub." };
  }
  if (!Array.isArray(payload)) {
    return { ok: false, reason: "unreachable", message: "Unexpected response shape from GitHub." };
  }

  const commits = payload.flatMap((raw) => {
    const mapped = mapCommit(raw as ApiCommit);
    return mapped ? [mapped] : [];
  });

  const enrichCount = Math.min(opts.enrich ?? 0, commits.length);
  if (enrichCount > 0) {
    await Promise.all(
      commits.slice(0, enrichCount).map(async (commit, i) => {
        const detail = await fetchCommitStats(ref, commit.sha, opts.signal);
        if (detail) commits[i] = { ...commit, ...detail };
      }),
    );
  }

  return { ok: true, commits };
}

async function fetchCommitStats(
  ref: RepoRef,
  sha: string,
  signal?: AbortSignal,
): Promise<Pick<FetchedCommit, "additions" | "deletions" | "filesChanged"> | null> {
  try {
    const res = await fetch(`${API}/repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(sha)}`, {
      headers: headers(),
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as ApiCommit;
    return {
      additions: num(raw.stats?.additions),
      deletions: num(raw.stats?.deletions),
      filesChanged: Array.isArray(raw.files) ? raw.files.length : null,
    };
  } catch {
    return null;
  }
}
