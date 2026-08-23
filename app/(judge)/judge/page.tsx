import Link from "next/link";
import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { createClient } from "@/lib/supabase/server";
import {
  hasCompletedCalibration,
  listAssignmentsForJudge,
  listCalibrationSamples,
  listRubricCriteria,
} from "@/lib/judging/queries";
import { CalibrationForm } from "@/components/judging/calibration-form";
import { JudgeNav } from "@/components/judging/judge-nav";
import { JudgeWelcomePrompt } from "@/components/judging/judge-welcome-prompt";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { formatSkills } from "@/lib/teams/membership";

export default async function JudgeDashboardPage() {
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();
  const judgeEvents = access.eventRoles.filter((r) => r.role === "judge");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, university, course, grad_year, skills, github_username, timezone")
    .eq("id", access.user.id)
    .maybeSingle();

  if (!profile?.full_name) {
    return (
      <RoleFrame title="Judge dashboard" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
        <JudgeWelcomePrompt
          preserve={{
            university: profile?.university ?? null,
            course: profile?.course ?? null,
            grad_year: profile?.grad_year ?? null,
            skills: formatSkills(profile?.skills ?? []),
            github_username: profile?.github_username ?? null,
            timezone: profile?.timezone ?? "Europe/London",
          }}
        />
      </RoleFrame>
    );
  }

  const sections = await Promise.all(
    judgeEvents.map(async (event) => {
      const calibrated = await hasCompletedCalibration(supabase, access.user.id, event.eventId);
      const [assignments, criteria, samples] = await Promise.all([
        listAssignmentsForJudge(supabase, access.user.id, event.eventId),
        listRubricCriteria(supabase, event.eventId),
        calibrated ? Promise.resolve([]) : listCalibrationSamples(supabase, event.eventId),
      ]);
      return { event, calibrated, assignments, criteria, samples };
    }),
  );

  return (
    <RoleFrame title="Judge dashboard" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          You aren&apos;t assigned as a judge on any event yet. Ask the organizer to invite you.
        </Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, calibrated, assignments, criteria, samples }, i) => (
            <FadeUp key={event.eventId} delay={0.05 * i}>
              <section className="flex flex-col gap-4" data-testid={`judge-event-${event.eventSlug}`}>
                <h2 className="font-display text-base font-semibold">{event.eventName}</h2>

                {!calibrated ? (
                  <div className="flex flex-col gap-4" data-testid="calibration-gate">
                    <Panel variant="glow" className="border-primary/40 text-sm text-primary">
                      <p className="font-display text-base font-semibold not-italic">Before you score</p>
                      <p className="mt-1 text-muted-foreground">
                        Complete calibration on a reference sample first. It can&apos;t be skipped — enforced at the
                        database level, not just this screen. This keeps every judge&apos;s scale consistent before real
                        teams get scored.
                      </p>
                    </Panel>
                    {samples.length === 0 ? (
                      <Panel className="text-sm text-muted-foreground">
                        No calibration samples published yet — check back once the organizer publishes one.
                      </Panel>
                    ) : (
                      samples.map((sample) => <CalibrationForm key={sample.id} sample={sample} criteria={criteria} />)
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/judge/pairwise?event=${event.eventId}`}
                        className="chip transition-colors hover:text-primary"
                        data-testid="go-pairwise"
                      >
                        Pairwise comparisons
                      </Link>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {assignments.map((a) => (
                        <li key={a.teamId} data-testid={`assignment-${a.teamId}`}>
                          <Panel className="flex items-center justify-between py-3">
                            <div>
                              <p className="text-sm font-medium">{a.teamName}</p>
                              {a.projectName ? <p className="text-xs text-muted-foreground">{a.projectName}</p> : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
                                {a.hasConflict ? "recused" : a.status}
                              </span>
                              <Link
                                href={`/judge/${a.teamId}`}
                                className="chip transition-colors hover:text-primary"
                                data-testid={`open-${a.teamId}`}
                              >
                                Open
                              </Link>
                            </div>
                          </Panel>
                        </li>
                      ))}
                      {assignments.length === 0 ? (
                        <Panel className="text-sm text-muted-foreground">
                          No teams assigned yet — the organizer hasn&apos;t assigned you a slate.
                        </Panel>
                      ) : null}
                    </ul>
                  </>
                )}
              </section>
            </FadeUp>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
