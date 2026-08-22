import { notFound } from "next/navigation";
import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { createClient } from "@/lib/supabase/server";
import {
  getAiReview,
  getScoresForTeam,
  hasCompletedCalibration,
  listRubricCriteria,
} from "@/lib/judging/queries";
import { JudgeNav } from "@/components/judging/judge-nav";
import { RubricForm } from "@/components/judging/rubric-form";
import { ConflictDeclare, DiscussionFlag, JudgeNotes } from "@/components/judging/team-tools";
import { AiReviewPanel } from "@/components/judging/ai-review-panel";
import { UnifiedTimeline } from "@/components/timeline/unified-timeline";
import { Panel } from "@/components/ui/panel";
import { buildTimeline } from "@/lib/timeline/merge";
import { listCheckIns } from "@/lib/checkins/queries";
import { listCommits } from "@/lib/github/queries";
import { listApiCalls } from "@/lib/proxy/queries";

export default async function JudgeTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("judge_assignments")
    .select("id, event_id, status")
    .eq("judge_id", access.user.id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: conflict } = await supabase
    .from("judge_conflicts")
    .select("reason")
    .eq("judge_id", access.user.id)
    .eq("team_id", teamId)
    .maybeSingle();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, project_name, description, repo_url, video_url")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) notFound();

  const calibrated = await hasCompletedCalibration(supabase, access.user.id, assignment.event_id);
  const criteria = await listRubricCriteria(supabase, assignment.event_id);
  const scoresByPhase = calibrated
    ? await getScoresForTeam(supabase, access.user.id, teamId)
    : { prepanel: [], live: [] };

  const [{ data: flag }, { data: note }, review, checkIns, commits, apiCalls] = await Promise.all([
    supabase.from("discussion_flags").select("note").eq("judge_id", access.user.id).eq("team_id", teamId).maybeSingle(),
    supabase.from("judge_notes").select("body").eq("judge_id", access.user.id).eq("team_id", teamId).maybeSingle(),
    getAiReview(supabase, teamId),
    listCheckIns(supabase, teamId),
    listCommits(supabase, teamId),
    listApiCalls(supabase, teamId),
  ]);

  const timeline = buildTimeline({ checkIns, commits, apiCalls });
  const recused = Boolean(conflict) || assignment.status === "recused";

  return (
    <RoleFrame title={team.name} roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      <div className="flex flex-col gap-8">
        {team.project_name ? <p className="text-sm text-muted-foreground">{team.project_name}</p> : null}
        {team.description ? <p className="text-sm">{team.description}</p> : null}

        {!calibrated ? (
          <Panel variant="glow" className="border-primary/40 text-sm text-primary">
            Complete calibration on the dashboard before you can score this team.
          </Panel>
        ) : recused ? (
          <Panel>
            <ConflictDeclare teamId={teamId} hasConflict={true} />
          </Panel>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel variant="glow">
                <RubricForm teamId={teamId} criteria={criteria} phase="prepanel" existing={scoresByPhase.prepanel} />
              </Panel>
              <Panel variant="glow">
                <RubricForm teamId={teamId} criteria={criteria} phase="live" existing={scoresByPhase.live} />
              </Panel>
            </div>
            <Panel>
              <ConflictDeclare teamId={teamId} hasConflict={false} />
            </Panel>
          </>
        )}

        <Panel>
          <AiReviewPanel teamId={teamId} review={review} />
        </Panel>

        <Panel>
          <h2 className="mb-3 text-base font-semibold uppercase tracking-eyebrow text-primary">Process signal</h2>
          <UnifiedTimeline events={timeline} repoUrl={team.repo_url} />
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel>
            <DiscussionFlag teamId={teamId} defaultNote={flag?.note ?? null} />
          </Panel>
          <Panel>
            <JudgeNotes teamId={teamId} defaultBody={note?.body ?? ""} />
          </Panel>
        </div>
      </div>
    </RoleFrame>
  );
}
