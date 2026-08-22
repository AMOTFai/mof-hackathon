import { Starfield } from "@/components/ui/starfield";
import { Panel } from "@/components/ui/panel";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <Starfield />
      <Panel variant="glow" className="relative z-10 w-full max-w-md">
        <p className="text-sm uppercase tracking-eyebrow text-primary">Minds of the Future</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-muted-foreground">
          {email ? (
            <>
              We sent a sign-in link to <span className="font-mono text-foreground">{email}</span>. Open it on
              this device to continue.
            </>
          ) : (
            <>We sent a sign-in link. Open it on this device to continue.</>
          )}
        </p>
      </Panel>
    </main>
  );
}
