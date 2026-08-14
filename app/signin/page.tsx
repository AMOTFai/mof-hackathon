import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, setSession } from "@/lib/session";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  if (!email) return;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: name || email.split("@")[0], role: "participant" } });
  }
  await setSession(user.id);
  redirect("/");
}

const demos = [
  ["organizer@motf.dev", "Organizer"],
  ["judge.garry@motf.dev", "Judge · commercial"],
  ["maya.chen@motf.dev", "Participant · Forge"],
  ["grace.kim@motf.dev", "Participant · Nimbus"],
];

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6">
      <div className="grid w-full items-center gap-10 md:grid-cols-2">
        <div className="animate-fade-up">
          <p className="eyebrow mb-3">KCL AI Hackathon</p>
          <h1 className="text-4xl font-semibold tracking-tight glow-text">Minds of the Future</h1>
          <p className="mt-4 max-w-md text-slate-400">
            The process-visibility platform. Log the journey, not just the demo — teams check in daily, judges
            see how you actually got there.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {["Daily checkpoints", "AI log review", "Cup / Plate brackets", "Weighted judging"].map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </div>

        <div className="glass-strong animate-fade-up p-7">
          <h2 className="mb-1 text-lg font-semibold">Sign in</h2>
          <p className="mb-5 text-sm text-slate-400">Your event profile. New here? Enter email + name to join.</p>
          <form action={signIn} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required placeholder="you@kcl.ac.uk" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="name">Name (new accounts)</label>
              <input id="name" name="name" type="text" placeholder="Your name" className="input" />
            </div>
            <button className="btn-primary w-full" type="submit">Continue →</button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Demo accounts</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {demos.map(([email, role]) => (
                <div key={email} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                  <p className="truncate font-mono text-[11px] text-slate-300">{email}</p>
                  <p className="text-[10px] text-slate-500">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
