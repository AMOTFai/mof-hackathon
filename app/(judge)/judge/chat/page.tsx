import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { JudgeNav } from "@/components/judging/judge-nav";
import { JudgeChat } from "@/components/judging/judge-chat";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { listJudgeMessages } from "@/lib/comms/queries";

export default async function JudgeChatPage() {
  const access = await requireRoles(["judge"]);
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", access.user.id)
    .maybeSingle();
  const judgeEvents = access.eventRoles.filter((r) => r.role === "judge");
  const sections = await Promise.all(
    judgeEvents.map(async (event) => ({
      event,
      messages: await listJudgeMessages(supabase, event.eventId),
    })),
  );

  return (
    <RoleFrame title="Judge chat" roleLabel={roleBadge(access.roles)} eventRoles={access.eventRoles}>
      <JudgeNav />
      {sections.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">You aren&apos;t assigned as a judge on any event yet.</Panel>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map(({ event, messages }) => (
            <section key={event.eventId} className="flex flex-col gap-3">
              <h2 className="font-display text-base font-semibold">{event.eventName}</h2>
              <JudgeChat
                eventId={event.eventId}
                userId={access.user.id}
                userName={profile?.full_name ?? null}
                userAvatarUrl={profile?.avatar_url ?? null}
                initial={messages}
              />
            </section>
          ))}
        </div>
      )}
    </RoleFrame>
  );
}
