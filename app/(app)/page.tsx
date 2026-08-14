import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDateTime, relTime } from "@/lib/format";
import { ANNOUNCEMENTS, isStaff } from "@/lib/enums";
import { statusFor, nextDue, isPlateCapped, type CheckpointDef, type TeamCheckpointRec } from "@/lib/checkpoints";
import { StatusPill, BracketChip, Progress, SectionTitle } from "@/components/ui";
import Countdown from "@/components/Countdown";

export default async function OverviewPage() {
  const user = await requireUser();

  const [announcements, cpsRaw] = await Promise.all([
    prisma.message.findMany({ where: { channel: ANNOUNCEMENTS }, orderBy: { createdAt: "desc" }, take: 3, include: { sender: true } }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
  ]);
  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">KCL AI Hackathon</p>
          <h1 className="text-2xl font-semibold tracking-tight glow-text">Welcome back, {user.name.split(" ")[0]}.</h1>
        </div>
      </div>

      {user.role === "participant" && <ParticipantHome userTeamId={user.teamId} defs={defs} />}
      {isStaff(user.role) && <StaffHome role={user.role} />}

      <section>
        <SectionTitle eyebrow="Broadcast" title="Announcements" action={<Link href="/messages" className="text-xs text-teal-300 hover:underline">All →</Link>} />
        <div className="grid gap-3 sm:grid-cols-3">
          {announcements.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
          {announcements.map((a) => (
            <div key={a.id} className="card">
              <p className="text-sm">{a.text}</p>
              <p className="mt-2 text-xs text-slate-500">{a.sender.name} · {relTime(a.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function ParticipantHome({ userTeamId, defs }: { userTeamId: string | null; defs: CheckpointDef[] }) {
  if (!userTeamId) {
    return (
      <div className="glass-strong flex flex-col items-start gap-3 p-6">
        <h2 className="text-lg font-semibold">You haven't joined a team yet</h2>
        <p className="text-sm text-slate-400">Team formation closes Monday EOD. Create or join a team to start logging progress.</p>
        <Link href="/team" className="btn-primary">Find a team →</Link>
      </div>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: userTeamId },
    include: { checkpoints: true, checkIns: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!team) return null;
  const recs: TeamCheckpointRec[] = team.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
  const statuses = defs.map((d) => ({ def: d, status: statusFor(d, recs.find((r) => r.checkpointId === d.id)) }));
  const hit = statuses.filter((s) => s.status === "hit").length;
  const late = statuses.filter((s) => s.status === "late").length;
  const upcoming = nextDue(defs, recs);
  const capped = isPlateCapped(defs, recs);

  // 6pm daily check-in state.
  const today6pm = new Date(); today6pm.setHours(18, 0, 0, 0);
  const lastCheckIn = team.checkIns[0]?.createdAt;
  const checkedToday = lastCheckIn && new Date(lastCheckIn).toDateString() === new Date().toDateString();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="glass-strong p-6 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{team.name}</h2>
            <BracketChip bracket={capped ? "plate" : team.bracket} />
            {capped && <span className="chip border-rose-400/40 bg-rose-400/10 text-rose-300">Plate-capped</span>}
          </div>
          <Progress total={defs.length} hit={hit} late={late} />
        </div>

        {upcoming ? (
          <div className="mb-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="eyebrow mb-1">Next deadline</p>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{upcoming.label}</span>
              <Countdown to={upcoming.dueAt.toISOString()} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{upcoming.requirement}</p>
          </div>
        ) : (
          <p className="mb-5 text-sm text-teal-200">All checkpoints addressed. 🎉</p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {statuses.map(({ def, status }) => (
            <div key={def.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">{fmtDateTime(def.dueAt).split(",")[0]}</span>
                <StatusPill status={status} />
              </div>
              <p className="text-sm font-medium leading-tight">{def.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className={`glass p-5 ${!checkedToday ? "border-amber-400/30" : ""}`}>
          <p className="eyebrow mb-1">Daily 6pm check-in</p>
          {checkedToday ? (
            <p className="text-sm text-teal-200">Logged today ✓</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-400">
                Mandatory each build day. {new Date() > today6pm ? "Overdue today." : <>Due <Countdown to={today6pm.toISOString()} />.</>}
              </p>
              <Link href="/team" className="btn-primary w-full">Log check-in →</Link>
            </>
          )}
        </div>
        <Link href="/team" className="card block transition-colors hover:border-white/20">
          <p className="eyebrow mb-1">Team workspace</p>
          <p className="text-sm text-slate-300">Check-ins, checkpoints, project + final submission →</p>
        </Link>
      </div>
    </div>
  );
}

async function StaffHome({ role }: { role: string }) {
  const [teams, judges, submitted] = await Promise.all([
    prisma.team.count(),
    prisma.user.count({ where: { role: "judge" } }),
    prisma.team.count({ where: { submittedAt: { not: null } } }),
  ]);
  const stats = [
    ["Teams", teams],
    ["Submitted", submitted],
    ["Judges", judges],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map(([label, n]) => (
        <div key={label} className="glass-strong p-6">
          <p className="eyebrow mb-2">{label}</p>
          <p className="font-mono text-3xl font-semibold glow-text">{n}</p>
        </div>
      ))}
      <div className="sm:col-span-3 flex flex-wrap gap-3">
        <Link href="/judge" className="btn-primary">Open judging →</Link>
        {role === "organizer" && <Link href="/organizer" className="btn-ghost">Organizer console →</Link>}
      </div>
    </div>
  );
}
