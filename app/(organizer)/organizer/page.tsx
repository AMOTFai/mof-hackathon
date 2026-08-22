import { requireRoles } from "@/lib/auth/guards";
import { RoleFrame, roleBadge } from "@/components/auth/role-frame";
import { OrganizerNav } from "@/components/organizer/organizer-nav";
import { Panel } from "@/components/ui/panel";
import { FadeUp } from "@/components/motion/fade-up";
import Link from "next/link";

export default async function OrganizerDashboardPage() {
  const access = await requireRoles(["organizer", "admin"]);
  const isAdmin = access.roles.includes("admin");
  return (
    <RoleFrame
      title={isAdmin ? "Admin console" : "Organizer overview"}
      roleLabel={roleBadge(access.roles)}
      eventRoles={access.eventRoles}
    >
      <OrganizerNav />
      <FadeUp>
        <Panel variant="glow" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Run the event from here. Schedule and announcements are live for this session.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/organizer/schedule" className="chip transition-colors hover:text-primary">
              Edit schedule
            </Link>
            <Link href="/organizer/announcements" className="chip transition-colors hover:text-primary">
              Broadcast
            </Link>
          </div>
        </Panel>
      </FadeUp>
    </RoleFrame>
  );
}
