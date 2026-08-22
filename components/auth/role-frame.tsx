import type { ReactNode } from "react";
import type { Role } from "@/lib/enums";
import type { EventRoleRow } from "@/lib/auth/roles";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function RoleFrame({
  title,
  roleLabel,
  eventRoles,
  children,
}: {
  title: string;
  roleLabel: string;
  eventRoles: EventRoleRow[];
  children: ReactNode;
}) {
  const events = [...new Map(eventRoles.map((row) => [row.eventId, row])).values()];
  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-10 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-eyebrow text-primary">Minds of the Future</p>
            <h1 className="font-display text-lg font-semibold tracking-tight" data-testid="dashboard-title">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span data-testid="signed-in-role" className="chip text-primary">
              {roleLabel}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        {events.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {events.map((event) => event.eventName).join(" · ")}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function roleBadge(roles: readonly Role[]): string {
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("organizer")) return "Organizer";
  if (roles.includes("judge")) return "Judge";
  if (roles.includes("recruiter")) return "Recruiter";
  if (roles.includes("participant")) return "Participant";
  return "Signed in";
}
