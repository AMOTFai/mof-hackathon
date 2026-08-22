import { requireUser } from "@/lib/auth/session";
import { RoleFrame } from "@/components/auth/role-frame";
import { Panel } from "@/components/ui/panel";
import { CreateEventForm } from "./create-event-form";

export default async function NewEventPage() {
  await requireUser();
  return (
    <RoleFrame title="Create an event" roleLabel="Signed in" eventRoles={[]}>
      <Panel variant="glow" className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-eyebrow text-primary">Organizer setup</p>
        <p className="text-sm text-muted-foreground">
          Any signed-in user can spin up a new event — you become its organizer immediately. Venue-agnostic: name it
          whatever you like.
        </p>
      </Panel>
      <CreateEventForm />
    </RoleFrame>
  );
}
