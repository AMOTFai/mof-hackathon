import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Starfield } from "@/components/ui/starfield";
import { Panel } from "@/components/ui/panel";
import { BuildTimeline } from "@/components/brand/build-timeline";
import { LoginReveal } from "./login-reveal";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6 py-16">
      <Starfield />
      <LoginReveal>
        <div className="w-full max-w-md">
          <BuildTimeline className="mb-10" />
          <Panel variant="glow">
            <div className="flex flex-col gap-2">
              <p className="text-sm uppercase tracking-eyebrow text-primary">Minds of the Future</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in</h1>
              <p className="text-muted-foreground">
                Magic link or GitHub. Roles are per event — you land on the dashboard that matches yours.
              </p>
            </div>
            <div className="mt-6">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
          </Panel>
        </div>
      </LoginReveal>
    </main>
  );
}
