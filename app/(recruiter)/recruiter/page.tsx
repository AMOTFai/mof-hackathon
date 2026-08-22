import Link from "next/link";
import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { searchTalent, viewTalentProfile } from "@/lib/talent/queries";

export default async function RecruiterDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const access = await requireRoles(["recruiter"]);
  const supabase = await createClient();

  if (view) {
    let detail;
    let errorMessage: string | null = null;
    try {
      detail = await viewTalentProfile(supabase, view);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Could not load that profile.";
    }

    return (
      <RoleFrame title="Candidate" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
        <Link href="/recruiter" className="text-sm text-primary underline">
          ← Back to search
        </Link>
        {errorMessage ? (
          <p className="text-sm text-destructive" data-testid="recruiter-error">
            {errorMessage}
          </p>
        ) : detail ? (
          <FadeUp>
            <Panel variant="glow" className="flex flex-col gap-3" data-testid="candidate-detail">
              <h2 className="font-display text-lg font-semibold">{detail.profile.fullName ?? "Candidate"}</h2>
              {detail.headline ? <p className="text-sm text-muted-foreground">{detail.headline}</p> : null}
              {detail.openTo.length > 0 ? <p className="text-sm">Open to: {detail.openTo.join(", ")}</p> : null}
              {detail.profile.university ? (
                <p className="text-sm">
                  {detail.profile.university}
                  {detail.profile.course ? ` · ${detail.profile.course}` : ""}
                  {detail.profile.gradYear ? ` · ${detail.profile.gradYear}` : ""}
                </p>
              ) : null}
              {detail.profile.bio ? <p className="text-sm">{detail.profile.bio}</p> : null}
              {detail.profile.skills.length > 0 ? <p className="text-sm">Skills: {detail.profile.skills.join(", ")}</p> : null}
              {detail.profile.githubUsername ? <p className="text-sm">GitHub: @{detail.profile.githubUsername}</p> : null}
              <p className="font-mono text-xs text-muted-foreground">Viewing this profile is logged for the candidate to see.</p>
            </Panel>
          </FadeUp>
        ) : (
          <Panel className="text-sm text-muted-foreground">Profile not found or no longer consented.</Panel>
        )}
      </RoleFrame>
    );
  }

  const candidates = await searchTalent(supabase);

  return (
    <RoleFrame title="Recruiter search" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <p className="text-sm text-muted-foreground">
        Only participants who have actively consented and haven&apos;t let it expire appear here. Opening a profile
        logs the view — it&apos;s visible to the candidate.
      </p>
      {candidates.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">No consented candidates yet.</Panel>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="candidate-list">
          {candidates.map((c, i) => (
            <FadeUp key={c.userId} delay={0.03 * i}>
              <li>
                <Panel className="flex items-center justify-between py-3" data-testid={`candidate-${c.userId}`}>
                  <div>
                    <p className="text-sm font-medium">{c.headline ?? "Candidate"}</p>
                    {c.openTo.length > 0 ? <p className="text-xs text-muted-foreground">Open to: {c.openTo.join(", ")}</p> : null}
                  </div>
                  <Link href={`/recruiter?view=${c.userId}`} className="chip transition-colors hover:text-primary" data-testid={`view-${c.userId}`}>
                    View profile
                  </Link>
                </Panel>
              </li>
            </FadeUp>
          ))}
        </ul>
      )}
    </RoleFrame>
  );
}
