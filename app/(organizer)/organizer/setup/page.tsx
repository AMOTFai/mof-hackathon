import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { OrganizerNav } from "@/components/organizer/organizer-nav";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import {
  listAssignmentsForOrganizer,
  listCalibrationSamplesForOrganizer,
  listCriteriaForOrganizer,
  listInvitesForOrganizer,
  listJudgesForEvent,
  listMilestonesForOrganizer,
  listPendingErasureRequests,
  listRecruiterOrgs,
  listTeamsForOrganizer,
} from "@/lib/organizer/queries";
import { CalibrationSection, CriteriaSection, JudgesSection, MilestonesSection } from "@/components/organizer/setup-sections";
import { RecruiterSection } from "@/components/organizer/recruiter-section";
import { InvitesSection } from "@/components/organizer/invites-section";
import { ErasureQueue } from "@/components/organizer/erasure-queue";

export default async function OrganizerSetupPage() {
  const access = await requireRoles(["organizer", "admin"]);
  const supabase = await createClient();
  const isAdmin = access.roles.includes("admin");
  const staffEvents = access.eventRoles.filter((r) => r.role === "organizer" || r.role === "admin");
  const uniqueEvents = [...new Map(staffEvents.map((e) => [e.eventId, e])).values()];
  const [erasureRequests, appUrl] = await Promise.all([listPendingErasureRequests(supabase), getAppUrl()]);

  const sections = await Promise.all(
    uniqueEvents.map(async (event) => {
      const [milestones, criteria, judges, teams, assignments, samples, recruiterOrgs, invites] = await Promise.all([
        listMilestonesForOrganizer(supabase, event.eventId),
        listCriteriaForOrganizer(supabase, event.eventId),
        listJudgesForEvent(supabase, event.eventId),
        listTeamsForOrganizer(supabase, event.eventId),
        listAssignmentsForOrganizer(supabase, event.eventId),
        listCalibrationSamplesForOrganizer(supabase, event.eventId),
        listRecruiterOrgs(supabase),
        listInvitesForOrganizer(supabase, event.eventId),
      ]);
      return { event, milestones, criteria, judges, teams, assignments, samples, recruiterOrgs, invites };
    }),
  );

  return (
    <RoleFrame title="Event setup" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <OrganizerNav />
      <FadeUp>
        <Panel>
          <h2 className="mb-3 font-display text-base font-semibold">Erasure requests</h2>
          <ErasureQueue requests={erasureRequests} isAdmin={isAdmin} />
        </Panel>
      </FadeUp>
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          No events yet.{" "}
          <a href="/join/new-event" className="text-primary underline">
            Create one
          </a>
          .
        </Panel>
      ) : (
        <div className="flex flex-col gap-12">
          {sections.map(({ event, milestones, criteria, judges, teams, assignments, samples, recruiterOrgs, invites }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * (i + 1)}>
              <section className="flex flex-col gap-6" data-testid={`setup-${event.eventSlug}`}>
                <h2 className="font-display text-lg font-semibold">{event.eventName}</h2>

                <Panel>
                  <h3 className="mb-1 text-xs uppercase tracking-eyebrow text-primary">Invite links</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Share a link instead of an email — this is the only way to bring participants onto the event;
                    judges and recruiters can use it too instead of needing an existing account first.
                  </p>
                  <InvitesSection eventId={event.eventId} appUrl={appUrl} invites={invites} />
                </Panel>

                <Panel>
                  <h3 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Milestones</h3>
                  <MilestonesSection eventId={event.eventId} milestones={milestones} />
                </Panel>

                <Panel>
                  <h3 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Rubric criteria</h3>
                  <CriteriaSection eventId={event.eventId} criteria={criteria} />
                </Panel>

                <Panel>
                  <h3 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Judges &amp; assignments</h3>
                  <JudgesSection eventId={event.eventId} judges={judges} teams={teams} assignments={assignments} />
                </Panel>

                <Panel>
                  <h3 className="mb-3 text-xs uppercase tracking-eyebrow text-primary">Calibration samples</h3>
                  <CalibrationSection eventId={event.eventId} criteria={criteria} samples={samples} />
                </Panel>

                <Panel>
                  <h3 className="mb-1 text-xs uppercase tracking-eyebrow text-primary">Recruiter access</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Recruiter orgs aren&apos;t per-event in this schema — any DPA-signed org unlocks search for any
                    invited recruiter across every event they hold a role on.
                  </p>
                  <RecruiterSection eventId={event.eventId} orgs={recruiterOrgs} />
                </Panel>
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
