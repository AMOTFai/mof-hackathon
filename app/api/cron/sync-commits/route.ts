import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseRepo } from "@/lib/github/parse";
import { syncTeamCommits } from "@/lib/github/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled commit poll. Cron is one of the three sanctioned service-role
 * callers (webhooks, cron, bootstrap) — there is no user session here, so the
 * route authenticates the CALLER with CRON_SECRET before doing anything.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: with no secret configured the endpoint stays shut rather than
  // becoming an unauthenticated way to make us hammer GitHub.
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Only events that are actually running: no point polling finished ones.
  const { data: teams, error } = await service
    .from("teams")
    .select("id, tenant_id, repo_url, events!teams_event_id_fkey!inner(status)")
    .not("repo_url", "is", null)
    .in("events.status", ["open", "live", "judging"]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { teamId: string; error: string }[] = [];

  for (const team of teams ?? []) {
    if (!team.repo_url || !parseRepo(team.repo_url)) {
      skipped += 1;
      continue;
    }
    const result = await syncTeamCommits(service, {
      teamId: team.id,
      tenantId: team.tenant_id,
      repoUrl: team.repo_url,
      limit: 100,
      enrich: 0,
    });
    if (result.ok) {
      synced += 1;
    } else {
      failed += 1;
      if (errors.length < 10) errors.push({ teamId: team.id, error: result.error });
    }
  }

  return NextResponse.json({
    ok: true,
    teams: teams?.length ?? 0,
    synced,
    failed,
    skipped,
    errors,
  });
}
