import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { JudgeNav } from "@/components/judging/judge-nav";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { listRubricCriteria } from "@/lib/judging/queries";
import { formatWhen } from "@/lib/datetime";

export default async function JudgeAboutPage() {
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();
  const judgeEvents = access.eventRoles.filter((r) => r.role === "judge");

  const sections = await Promise.all(
    judgeEvents.map(async (event) => {
      const [{ data: details }, criteria] = await Promise.all([
        supabase
          .from("events")
          .select("tagline, venue, starts_at, ends_at, submission_deadline, working_demo_required, pairwise_blend")
          .eq("id", event.eventId)
          .maybeSingle(),
        listRubricCriteria(supabase, event.eventId),
      ]);
      return { event, details, criteria };
    }),
  );

  return (
    <RoleFrame title="About" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">You aren&apos;t assigned as a judge on any event yet.</Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, details, criteria }, i) => {
            const rubricWeight = details?.pairwise_blend != null ? Math.round((1 - details.pairwise_blend) * 100) : null;
            const pairwiseWeight = details?.pairwise_blend != null ? Math.round(details.pairwise_blend * 100) : null;
            return (
              <FadeUp key={event.eventId} delay={0.05 * i}>
                <section className="flex flex-col gap-4" data-testid={`judge-about-${event.eventSlug}`}>
                  <div>
                    <h2 className="font-display text-xl font-semibold">{event.eventName}</h2>
                    {details?.tagline ? <p className="mt-1 text-muted-foreground">{details.tagline}</p> : null}
                  </div>

                  <Panel variant="glow">
                    <p className="text-xs uppercase tracking-eyebrow text-primary">Timeline</p>
                    <dl className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="font-mono text-xs text-muted-foreground">Starts</dt>
                        <dd className="text-sm">{details?.starts_at ? formatWhen(details.starts_at) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-mono text-xs text-muted-foreground">Submission deadline</dt>
                        <dd className="text-sm">
                          {details?.submission_deadline ? formatWhen(details.submission_deadline) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-xs text-muted-foreground">Ends</dt>
                        <dd className="text-sm">{details?.ends_at ? formatWhen(details.ends_at) : "—"}</dd>
                      </div>
                    </dl>
                    {details?.venue ? (
                      <p className="mt-3 text-sm text-muted-foreground">Venue: {details.venue}</p>
                    ) : null}
                  </Panel>

                  <Panel>
                    <p className="text-xs uppercase tracking-eyebrow text-primary">Rubric</p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {criteria.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                          <span>{c.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">weight {c.weight}</span>
                        </li>
                      ))}
                    </ul>
                    {rubricWeight !== null && pairwiseWeight !== null ? (
                      <p className="mt-3 font-mono text-xs text-muted-foreground">
                        Final rank blends {rubricWeight}% rubric score with {pairwiseWeight}% pairwise comparison rank.
                      </p>
                    ) : null}
                    {details?.working_demo_required ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        A working demo is required — teams without one are capped to Plate regardless of score.
                      </p>
                    ) : null}
                  </Panel>

                  <Panel>
                    <p className="text-xs uppercase tracking-eyebrow text-primary">How judging works</p>
                    <ol className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                      <li>1. Complete calibration on a reference sample first — this can&apos;t be skipped.</li>
                      <li>2. Score assigned teams across two phases: pre-panel (async, from the timeline and demo) and live (Sunday pitch).</li>
                      <li>3. Optionally use pairwise comparisons to sharpen close calls between teams.</li>
                      <li>4. The AI review panel is an aid, never a score — always weigh it against the actual evidence.</li>
                    </ol>
                  </Panel>
                </section>
              </FadeUp>
            );
          })}
        </div>
      )}
    </RoleFrame>
  );
}
