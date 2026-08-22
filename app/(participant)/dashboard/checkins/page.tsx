import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { CheckInComposer } from "@/components/checkins/checkin-composer";
import { MilestoneStatusList } from "@/components/checkins/milestone-status-list";
import { ProcessSummaryBar, UnifiedTimeline } from "@/components/timeline/unified-timeline";
import { SyncCommitsButton } from "@/components/timeline/sync-commits-button";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getMembershipForEvent, listParticipantEvents } from "@/lib/teams/queries";
import { listCheckInRecs, listCheckIns, listMilestones } from "@/lib/checkins/queries";
import { listCommits } from "@/lib/github/queries";
import { listApiCalls } from "@/lib/proxy/queries";
import { milestonesWithStatus } from "@/lib/checkins/status";
import { buildTimeline, summarize } from "@/lib/timeline/merge";
import { repoWebUrl, parseRepo } from "@/lib/github/parse";

export default async function CheckInsPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const events = await listParticipantEvents(supabase, access.user.id);

  const sections = await Promise.all(
    events.map(async (event) => {
      const membership = await getMembershipForEvent(supabase, access.user.id, event.eventId);
      if (!membership) return { event, membership: null };
      const [defs, recs, checkIns, commits, apiCalls] = await Promise.all([
        listMilestones(supabase, event.eventId),
        listCheckInRecs(supabase, membership.teamId),
        listCheckIns(supabase, membership.teamId),
        listCommits(supabase, membership.teamId),
        listApiCalls(supabase, membership.teamId),
      ]);
      const timeline = buildTimeline({ checkIns, commits, apiCalls });
      return {
        event,
        membership,
        milestones: milestonesWithStatus(defs, recs),
        rawMilestones: defs,
        timeline,
        summary: summarize(timeline),
      };
    }),
  );

  return (
    <RoleFrame title="Process" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You need a participant role on an event before you can log check-ins.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, membership, milestones, rawMilestones, timeline, summary }, i) => {
            const ref = membership ? parseRepo(membership.repoUrl) : null;
            return (
              <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-6" data-testid={`checkins-${event.eventSlug}`}>
                <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                {!membership ? (
                  <Panel className="text-sm text-muted-foreground">Join or create a team on this event first.</Panel>
                ) : (
                  <>
                    {summary ? <ProcessSummaryBar summary={summary} /> : null}
                    <MilestoneStatusList milestones={milestones ?? []} />

                    <div className="flex flex-wrap items-start justify-between gap-3 glass p-4">
                      <div>
                        <p className="text-xs uppercase tracking-eyebrow text-muted-foreground">Linked repo</p>
                        {ref ? (
                          <a
                            href={repoWebUrl(ref)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm underline"
                            data-testid="repo-link"
                          >
                            {ref.owner}/{ref.repo}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not linked yet.</p>
                        )}
                      </div>
                      <SyncCommitsButton teamId={membership.teamId} hasRepo={Boolean(ref)} />
                    </div>

                    <CheckInComposer
                      teamId={membership.teamId}
                      milestones={rawMilestones ?? []}
                      locked={Boolean(membership.submittedAt)}
                    />
                    <UnifiedTimeline
                      events={timeline ?? []}
                      repoUrl={membership.repoUrl}
                      currentUserId={access.user.id}
                    />
                  </>
                )}
              </section>
              </FadeUp>
            );
          })}
        </div>
      )}
    </RoleFrame>
  );
}
