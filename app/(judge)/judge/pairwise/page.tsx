import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { createClient } from "@/lib/supabase/server";
import { getJudgeVotedPairs, hasCompletedCalibration, listPairwiseCandidates } from "@/lib/judging/queries";
import { selectNextPair } from "@/lib/judging/pairwise";
import { JudgeNav } from "@/components/judging/judge-nav";
import { PairwiseVote } from "@/components/judging/pairwise-vote";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";

export default async function PairwisePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventId } = await searchParams;
  const access = await requireRoles(["judge"]);
  if (!eventId) redirect("/judge");

  const isJudgeOnEvent = access.eventRoles.some((r) => r.eventId === eventId && r.role === "judge");
  if (!isJudgeOnEvent) redirect("/judge");

  const supabase = await createClient();
  const calibrated = await hasCompletedCalibration(supabase, access.user.id, eventId);
  if (!calibrated) redirect("/judge");

  const [candidates, voted] = await Promise.all([
    listPairwiseCandidates(supabase, eventId),
    getJudgeVotedPairs(supabase, access.user.id),
  ]);

  const ratings = candidates.map((c) => c.rating);
  const next = selectNextPair(ratings, voted);
  const teamA = next ? candidates.find((c) => c.id === next.teamA.teamId) : null;
  const teamB = next ? candidates.find((c) => c.id === next.teamB.teamId) : null;

  return (
    <RoleFrame title="Pairwise comparisons" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      <FadeUp>
        <Panel variant="glow" className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Pick the stronger team each round. Pairs are chosen to be genuinely close calls — that&apos;s what makes
            them informative.
          </p>
          {candidates.length < 2 ? (
            <p className="text-sm text-muted-foreground">Not enough submitted teams yet to compare.</p>
          ) : teamA && teamB ? (
            <PairwiseVote
              eventId={eventId}
              teamA={{ id: teamA.id, name: teamA.name, projectName: teamA.projectName }}
              teamB={{ id: teamB.id, name: teamB.name, projectName: teamB.projectName }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              You&apos;ve compared every pair — check back if more teams submit.
            </p>
          )}
        </Panel>
      </FadeUp>
    </RoleFrame>
  );
}
