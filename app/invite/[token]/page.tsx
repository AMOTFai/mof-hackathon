import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Starfield } from "@/components/ui/starfield";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "./accept-invite-form";

const REASON_COPY: Record<string, string> = {
  not_found: "This invite link doesn't exist.",
  revoked: "This invite link has been revoked by the organizer.",
  expired: "This invite link has expired.",
  used_up: "This invite link has already been used.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: preview }, user] = await Promise.all([
    supabase.rpc("preview_invite", { p_token: token }).single(),
    getUser(),
  ]);

  const valid = preview?.valid ?? false;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <Starfield />
      <Panel variant={valid ? "glow" : "default"} className="relative z-10 w-full max-w-md">
        <p className="text-sm uppercase tracking-eyebrow text-primary">Minds of the Future</p>
        {!valid ? (
          <>
            <h1 className="mt-1 font-display text-2xl font-semibold">Invite unavailable</h1>
            <p className="mt-2 text-muted-foreground">
              {REASON_COPY[preview?.reason ?? ""] ?? "This invite link isn't valid."} Ask the organizer for a fresh
              one.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-display text-2xl font-semibold">You&apos;re invited</h1>
            <p className="mt-2 text-muted-foreground">
              Join <span className="text-foreground">{preview?.event_name}</span> as a{" "}
              <span className="chip text-primary">{preview?.role}</span>.
            </p>
            <div className="mt-6">
              {user ? (
                <AcceptInviteForm token={token} />
              ) : (
                <Button asChild variant="mission" className="w-full">
                  <a href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</a>
                </Button>
              )}
            </div>
          </>
        )}
      </Panel>
    </main>
  );
}
