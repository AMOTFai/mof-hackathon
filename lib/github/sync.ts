import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchCommits } from "@/lib/github/client";

type Client = SupabaseClient<Database>;

export type SyncOutcome =
  | { ok: true; fetched: number; stored: number }
  | { ok: false; error: string };

/**
 * Pull commits for one team and upsert them.
 *
 * `commits` has a SELECT policy but no INSERT policy, so writes are service-role
 * only (per Part 3: writes via service role / webhook). Callers MUST authorize
 * the actor against `teamId` with the user-scoped client BEFORE calling this —
 * this function does no authorization of its own, and takes an explicitly-named
 * service client so that stays obvious at the call site.
 *
 * Upsert is on (team_id, sha), so re-syncing is idempotent and never duplicates.
 */
export async function syncTeamCommits(
  service: Client,
  args: { teamId: string; tenantId: string | null; repoUrl: string; limit?: number; enrich?: number },
): Promise<SyncOutcome> {
  const result = await fetchCommits(args.repoUrl, { limit: args.limit ?? 100, enrich: args.enrich ?? 0 });
  if (!result.ok) return { ok: false, error: result.message };
  if (result.commits.length === 0) return { ok: true, fetched: 0, stored: 0 };

  const rows = result.commits.map((c) => ({
    team_id: args.teamId,
    tenant_id: args.tenantId,
    sha: c.sha,
    message: c.message,
    author_login: c.authorLogin,
    authored_at: c.authoredAt,
    additions: c.additions,
    deletions: c.deletions,
    files_changed: c.filesChanged,
  }));

  const { data, error } = await service
    .from("commits")
    .upsert(rows, { onConflict: "team_id,sha", ignoreDuplicates: false })
    .select("id");
  if (error) return { ok: false, error: error.message };

  return { ok: true, fetched: result.commits.length, stored: data?.length ?? 0 };
}
