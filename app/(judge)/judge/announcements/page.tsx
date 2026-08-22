import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { JudgeNav } from "@/components/judging/judge-nav";
import { AnnouncementInbox } from "@/components/comms/announcement-inbox";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { listAnnouncements } from "@/lib/comms/queries";

export default async function JudgeAnnouncementsPage() {
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();
  const judgeEvents = access.eventRoles.filter((r) => r.role === "judge");
  const sections = await Promise.all(
    judgeEvents.map(async (event) => ({
      event,
      items: await listAnnouncements(supabase, event.eventId, access.user.id),
    })),
  );

  return (
    <RoleFrame title="Announcements" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">You aren&apos;t assigned as a judge on any event yet.</Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, items }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`judge-announce-${event.eventSlug}`}>
                <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                <AnnouncementInbox eventId={event.eventId} userId={access.user.id} initial={items} />
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
