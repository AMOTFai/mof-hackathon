import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JOIN_PATH } from "@/lib/auth/paths";
import { resolveAccess } from "@/lib/auth/roles";
import { RoleFrame } from "@/components/auth/role-frame";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";

export default async function JoinPage() {
  const access = await resolveAccess();
  if (access.home !== JOIN_PATH) redirect(access.home);
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("slug, name, status")
    .in("status", ["open", "live"])
    .order("starts_at", { ascending: true });

  return (
    <RoleFrame title="No event role yet" roleLabel="Signed in" eventRoles={access.eventRoles}>
      <FadeUp>
        <Panel variant="glow" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in, but you don&apos;t have a role on an event yet. An organizer has to assign you
            before you can open a dashboard.
          </p>
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {events.map((event) => (
                <li key={event.slug} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {event.name}
                  <span className="chip">{event.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open events right now.</p>
          )}
          <p className="text-sm">
            Organizing one yourself?{" "}
            <Link href="/join/new-event" className="text-primary underline" data-testid="new-event-link">
              Create an event
            </Link>
            .
          </p>
        </Panel>
      </FadeUp>
    </RoleFrame>
  );
}
