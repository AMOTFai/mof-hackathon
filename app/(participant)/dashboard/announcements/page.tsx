import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { AnnouncementInbox } from "@/components/comms/announcement-inbox";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { listAnnouncements } from "@/lib/comms/queries";
import { listParticipantEvents } from "@/lib/teams/queries";

export default async function ParticipantAnnouncementsPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const events = await listParticipantEvents(supabase, access.user.id);
  const sections = await Promise.all(
    events.map(async (event) => ({
      event,
      items: await listAnnouncements(supabase, event.eventId, access.user.id),
    })),
  );

  return (
    <RoleFrame title="Announcements" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      <div className="flex flex-col gap-10">
        {sections.map(({ event, items }, i) => (
          <FadeUp key={event.eventId} delay={0.05 * i}>
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
              <AnnouncementInbox eventId={event.eventId} userId={access.user.id} initial={items} />
            </section>
          </FadeUp>
        ))}
      </div>
    </RoleFrame>
  );
}
