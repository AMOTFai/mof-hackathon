import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { OrganizerNav } from "@/components/organizer/organizer-nav";
import { CreateScheduleForm, EditScheduleItem } from "@/components/organizer/schedule-forms";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { listSchedule, staffEvents } from "@/lib/comms/queries";

export default async function OrganizerSchedulePage() {
  const access = await requireRoles(["organizer", "admin"]);
  const events = staffEvents(access.eventRoles);
  const supabase = await createClient();
  const sections = await Promise.all(
    events.map(async (event) => ({
      event,
      items: await listSchedule(supabase, event.eventId),
    })),
  );

  return (
    <RoleFrame title="Schedule" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <OrganizerNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You need an organizer role on an event before you can edit the schedule.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, items }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`org-schedule-${event.eventSlug}`}>
                <div>
                  <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                  <p className="text-sm text-muted-foreground">{event.eventSlug}</p>
                </div>
                <CreateScheduleForm eventId={event.eventId} />
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <EditScheduleItem key={item.id} item={item} />
                  ))}
                </div>
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
