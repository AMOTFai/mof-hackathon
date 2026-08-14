// Pull recent commit history for a linked GitHub repo. Best-effort: returns [] on
// any error (private repo, bad URL, rate limit) so the caller degrades gracefully.

export type FetchedCommit = {
  sha: string;
  message: string;
  author: string | null;
  committedAt: Date;
  url: string;
};

export function parseRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const m = repoUrl
      .trim()
      .replace(/\.git$/, "")
      .match(/github\.com[/:]([^/]+)\/([^/]+)/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  } catch {
    return null;
  }
}

export async function fetchCommits(repoUrl: string, limit = 50): Promise<FetchedCommit[]> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return [];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "minds-of-the-future",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=${limit}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    return data.map((c) => ({
      sha: c.sha,
      message: (c.commit?.message ?? "").split("\n")[0].slice(0, 300),
      author: c.commit?.author?.name ?? c.author?.login ?? null,
      committedAt: new Date(c.commit?.author?.date ?? c.commit?.committer?.date ?? Date.now()),
      url: c.html_url ?? "",
    }));
  } catch {
    return [];
  }
}
