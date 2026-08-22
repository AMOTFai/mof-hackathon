import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { OrganizerNav } from "@/components/organizer/organizer-nav";
import { PostAnnouncementForm } from "@/components/organizer/announcement-forms";
import { LiveReceipts } from "@/components/organizer/live-receipts";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { announcementReadCounts, countParticipants, listAnnouncements, staffEvents } from "@/lib/comms/queries";

export default async function OrganizerAnnouncementsPage() {
  const access = await requireRoles(["organizer", "admin"]);
  const events = staffEvents(access.eventRoles);
  const supabase = await createClient();
  const sections = await Promise.all(
    events.map(async (event) => {
      const items = await listAnnouncements(supabase, event.eventId, access.user.id);
      const counts = await announcementReadCounts(
        supabase,
        items.map((item) => item.id),
      );
      const participantCount = await countParticipants(supabase, event.eventId);
      return {
        event,
        participantCount,
        items: items.map((item) => ({ ...item, readCount: counts.get(item.id) ?? 0 })),
      };
    }),
  );

  return (
    <RoleFrame title="Announcements" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <OrganizerNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You need an organizer role on an event before you can broadcast.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, items, participantCount }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`org-announce-${event.eventSlug}`}>
                <div>
                  <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                  <p className="text-sm text-muted-foreground">{participantCount} participants</p>
                </div>
                <PostAnnouncementForm eventId={event.eventId} />
                <LiveReceipts items={items} participantCount={participantCount} />
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
