import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { JudgeNav } from "@/components/judging/judge-nav";
import { ScheduleList } from "@/components/schedule/schedule-list";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { listSchedule } from "@/lib/comms/queries";

export default async function JudgeSchedulePage() {
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();
  const judgeEvents = access.eventRoles.filter((r) => r.role === "judge");
  const sections = await Promise.all(
    judgeEvents.map(async (event) => ({
      event,
      items: await listSchedule(supabase, event.eventId),
    })),
  );

  return (
    <RoleFrame title="Schedule" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">You aren&apos;t assigned as a judge on any event yet.</Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, items }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`judge-schedule-${event.eventSlug}`}>
                <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
                <ScheduleList items={items} />
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
