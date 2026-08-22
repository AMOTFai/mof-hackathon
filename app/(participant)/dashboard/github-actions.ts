"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { syncCommitsSchema } from "@/lib/validation/github";
import { parseRepo } from "@/lib/github/parse";
import { syncTeamCommits } from "@/lib/github/sync";

/**
 * Sync a team's commits on demand.
 *
 * Authorization is done with the USER-scoped client (RLS applies). Only after
 * that do we reach for the service client, and only to write commits for the one
 * team id we just verified — `commits` has no INSERT policy, so there is no
 * user-scoped path for this write.
 */
export async function syncCommits(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = syncCommitsSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (!membership) return { ok: false, error: "You are not on this team." };

  // Read the repo URL through RLS too, so a forged team id cannot leak one.
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, tenant_id, repo_url")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (teamError) return { ok: false, error: teamError.message };
  if (!team) return { ok: false, error: "Team not found." };
  if (!team.repo_url) return { ok: false, error: "Add a repo URL on the submission page first." };
  if (!parseRepo(team.repo_url)) {
    return { ok: false, error: "That repo URL is not a recognized GitHub repository." };
  }

  const result = await syncTeamCommits(createServiceClient(), {
    teamId: team.id,
    tenantId: team.tenant_id,
    repoUrl: team.repo_url,
    limit: 100,
    // Stats cost one request per commit; only worth it with a token.
    enrich: process.env.GITHUB_TOKEN ? 20 : 0,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidateAfterParticipantWrite();
  return {
    ok: true,
    message:
      result.fetched === 0
        ? "No commits found on the default branch yet."
        : `Synced ${result.fetched} commit${result.fetched === 1 ? "" : "s"}.`,
  };
}
