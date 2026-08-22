import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { ParticipantNav } from "@/components/participant/participant-nav";
import { TeamChat } from "@/components/comms/team-chat";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { listTeamMessages } from "@/lib/comms/queries";
import { getMembershipForEvent, listParticipantEvents } from "@/lib/teams/queries";

export default async function ParticipantChatPage() {
  const access = await requireRoles(["participant"]);
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", access.user.id)
    .maybeSingle();
  const events = await listParticipantEvents(supabase, access.user.id);
  const sections = await Promise.all(
    events.map(async (event) => {
      const membership = await getMembershipForEvent(supabase, access.user.id, event.eventId);
      const messages = membership ? await listTeamMessages(supabase, membership.teamId) : [];
      return { event, membership, messages };
    }),
  );

  return (
    <RoleFrame title="Team chat" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <ParticipantNav />
      <div className="flex flex-col gap-10">
        {sections.map(({ event, membership, messages }) => (
          <section key={event.eventId} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
              {membership ? <p className="text-sm text-muted-foreground">{membership.name}</p> : null}
            </div>
            {membership ? (
              <TeamChat
                eventId={event.eventId}
                teamId={membership.teamId}
                userId={access.user.id}
                userName={profile?.full_name ?? null}
                userAvatarUrl={profile?.avatar_url ?? null}
                initial={messages}
              />
            ) : (
              <Panel className="text-sm text-muted-foreground">Join a team to open chat.</Panel>
            )}
          </section>
        ))}
      </div>
    </RoleFrame>
  );
}
