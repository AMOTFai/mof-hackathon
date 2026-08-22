import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { SubmissionForm } from "@/components/participant/submission-form";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getMembershipForEvent, listParticipantEvents } from "@/lib/teams/queries";

export default async function SubmitPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const events = await listParticipantEvents(supabase, access.user.id);

  const sections = await Promise.all(
    events.map(async (event) => ({
      event,
      membership: await getMembershipForEvent(supabase, access.user.id, event.eventId),
    })),
  );

  return (
    <RoleFrame title="Submission" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You need a participant role on an event before you can submit.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, membership }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`submit-${event.eventSlug}`}>
                <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                {membership ? (
                  <SubmissionForm membership={membership} />
                ) : (
                  <Panel className="text-sm text-muted-foreground">Join or create a team on this event first.</Panel>
                )}
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
