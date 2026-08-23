import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { WelcomeNamePrompt } from "@/components/participant/welcome-name-prompt";
import { CreateJoinTeam } from "@/components/participant/team-forms";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import { createClient } from "@/lib/supabase/server";
import { getMembershipForEvent, listParticipantEvents } from "@/lib/teams/queries";
import { formatSkills } from "@/lib/teams/membership";

export default async function ParticipantDashboardPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, university, course, grad_year, bio, skills, github_username, timezone")
    .eq("id", access.user.id)
    .maybeSingle();

  const events = await listParticipantEvents(supabase, access.user.id);
  const memberships = await Promise.all(
    events.map(async (event) => ({
      event,
      membership: await getMembershipForEvent(supabase, access.user.id, event.eventId),
    })),
  );

  if (!profile?.full_name) {
    return (
      <RoleFrame title="Participant dashboard" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
        <WelcomeNamePrompt
          preserve={{
            university: profile?.university ?? null,
            course: profile?.course ?? null,
            grad_year: profile?.grad_year ?? null,
            bio: profile?.bio ?? null,
            skills: formatSkills(profile?.skills ?? []),
            github_username: profile?.github_username ?? null,
            timezone: profile?.timezone ?? "Europe/London",
          }}
        />
      </RoleFrame>
    );
  }

  return (
    <RoleFrame title="Participant dashboard" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      <FadeUp>
        <p className="text-lg">
          Hi {profile.full_name}.{" "}
          <span className="text-muted-foreground">
            {profile.university ? `${profile.university}${profile.course ? ` · ${profile.course}` : ""}` : null}
          </span>
        </p>
      </FadeUp>
      <ul className="flex flex-col gap-3">
        {memberships.map(({ event, membership }, i) => (
          <li key={event.eventId}>
            <FadeUp delay={0.08 * (i + 1)}>
              {membership ? (
                <Panel variant="glow">
                  <p className="font-medium text-primary">{event.eventName}</p>
                  <p className="text-sm text-muted-foreground">
                    {membership.name} · {membership.members.length}/{event.maxTeamSize} · {membership.myRole}
                  </p>
                </Panel>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="font-medium text-primary">{event.eventName} — no team yet</p>
                  <CreateJoinTeam event={event} />
                </div>
              )}
            </FadeUp>
          </li>
        ))}
      </ul>
    </RoleFrame>
  );
}
