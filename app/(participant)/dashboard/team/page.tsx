import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { CreateJoinTeam, TeamManage } from "@/components/participant/team-forms";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getMembershipForEvent, listParticipantEvents } from "@/lib/teams/queries";
import { getAppUrl } from "@/lib/app-url";

export default async function TeamPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const [events, appUrl] = await Promise.all([listParticipantEvents(supabase, access.user.id), getAppUrl()]);

  const sections = await Promise.all(
    events.map(async (event) => ({
      event,
      membership: await getMembershipForEvent(supabase, access.user.id, event.eventId),
    })),
  );

  return (
    <RoleFrame title="Workbench" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You need a participant role on an event before you can create or join a team. Ask your organizer to add
          you.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, membership }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`event-${event.eventSlug}`}>
                <div>
                  <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {event.eventSlug} · max team size {event.maxTeamSize}
                  </p>
                </div>
                {membership ? (
                  <TeamManage membership={membership} currentUserId={access.user.id} appUrl={appUrl} />
                ) : (
                  <CreateJoinTeam event={event} />
                )}
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
