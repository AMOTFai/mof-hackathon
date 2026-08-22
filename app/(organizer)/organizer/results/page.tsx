import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { OrganizerNav } from "@/components/organizer/organizer-nav";
import { ResultsPanel, type ResultRow } from "@/components/organizer/results-panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizerResultsPage() {
  const access = await requireRoles(["organizer", "admin"]);
  const supabase = await createClient();
  const staffEvents = access.eventRoles.filter((r) => r.role === "organizer" || r.role === "admin");
  const uniqueEvents = [...new Map(staffEvents.map((e) => [e.eventId, e])).values()];

  const sections = await Promise.all(
    uniqueEvents.map(async (event) => {
      const { data } = await supabase
        .from("results")
        .select("team_id, rubric_score, pairwise_rank, final_rank, bracket, published, teams!inner(name, event_id)")
        .eq("teams.event_id", event.eventId);
      const rows: ResultRow[] = (data ?? []).map((r) => {
        const team = r.teams as unknown as { name: string };
        return {
          teamId: r.team_id,
          teamName: team.name,
          rubricScore: r.rubric_score,
          pairwiseRank: r.pairwise_rank,
          finalRank: r.final_rank,
          bracket: r.bracket ?? "unassigned",
          published: r.published,
        };
      });
      return { event, rows };
    }),
  );

  return (
    <RoleFrame title="Results" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <OrganizerNav />
      <div className="flex flex-col gap-10">
        {sections.map(({ event, rows }, i) => (
          <FadeUp key={event.eventId} delay={0.05 * i}>
            <section className="flex flex-col gap-4" data-testid={`results-${event.eventSlug}`}>
              <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
              <ResultsPanel eventId={event.eventId} rows={rows} />
            </section>
          </FadeUp>
        ))}
      </div>
    </RoleFrame>
  );
}
