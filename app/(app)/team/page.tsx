import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDateTime, relTime, skillsList } from "@/lib/format";
import { createTeam, joinTeam, leaveTeam, updateTeam } from "@/app/actions";
import { statusFor, isPlateCapped, type CheckpointDef, type TeamCheckpointRec } from "@/lib/checkpoints";
import CheckInForm from "@/components/CheckInForm";
import FinalSubmission from "@/components/FinalSubmission";
import CheckpointItem from "@/components/CheckpointItem";
import { BracketChip, Progress, SectionTitle, StatusPill } from "@/components/ui";

export default async function TeamPage() {
  const user = await requireUser();

  if (!user.teamId) {
    const teams = await prisma.team.findMany({ include: { members: true }, orderBy: { name: "asc" } });
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Join or create a team</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="glass-strong p-6">
            <h2 className="mb-4 font-medium">Create a team</h2>
            <form action={createTeam} className="space-y-3">
              <div><label className="label" htmlFor="name">Team name</label><input id="name" name="name" required className="input" /></div>
              <div><label className="label" htmlFor="projectName">Project name (optional)</label><input id="projectName" name="projectName" className="input" /></div>
              <button className="btn-primary">Create team</button>
            </form>
          </section>
          <section className="glass-strong p-6">
            <h2 className="mb-4 font-medium">Join an existing team</h2>
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.members.length}/5{t.projectName ? ` · ${t.projectName}` : ""}</p>
                  </div>
                  <form action={joinTeam}>
                    <input type="hidden" name="teamId" value={t.id} />
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={t.members.length >= 5}>{t.members.length >= 5 ? "Full" : "Join"}</button>
                  </form>
                </li>
              ))}
              {teams.length === 0 && <li className="text-sm text-slate-500">No teams yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  const [team, cpsRaw] = await Promise.all([
    prisma.team.findUnique({
      where: { id: user.teamId },
      include: { members: true, checkIns: { orderBy: { createdAt: "desc" } }, checkpoints: true },
    }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
  ]);
  if (!team) return null;

  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));
  const recs: TeamCheckpointRec[] = team.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
  const statuses = defs.map((d) => {
    const rec = recs.find((r) => r.checkpointId === d.id);
    return { def: d, rec, status: statusFor(d, rec) };
  });
  const hit = statuses.filter((s) => s.status === "hit").length;
  const late = statuses.filter((s) => s.status === "late").length;
  const capped = isPlateCapped(defs, recs);
  const locked = !!team.submittedAt;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-strong flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <BracketChip bracket={capped ? "plate" : team.bracket} />
            {capped && <span className="chip border-rose-400/40 bg-rose-400/10 text-rose-300">Plate-capped (missed Wed slice)</span>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{team.projectName || "No project name yet"}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="eyebrow mb-1">Checkpoints</p>
            <Progress total={defs.length} hit={hit} late={late} />
          </div>
          <form action={leaveTeam}><button className="btn-ghost px-3 py-1.5 text-xs">Leave</button></form>
        </div>
      </div>

      {/* Members */}
      <section>
        <SectionTitle eyebrow="Roster" title={`Members (${team.members.length}/5)`} />
        <div className="flex flex-wrap gap-2">
          {team.members.map((m) => (
            <div key={m.id} className="card min-w-[160px]">
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-slate-500">{m.university || "—"}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{skillsList(m.skills).map((s) => <span key={s} className="chip">{s}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Checkpoints */}
      <section>
        <SectionTitle eyebrow="Deadlines" title="Checkpoints" action={<span className="text-xs text-slate-500">{hit} hit · {late} late</span>} />
        <div className="grid gap-3 md:grid-cols-2">
          {statuses.map(({ def, rec, status }) => (
            <CheckpointItem
              key={def.id}
              def={{ id: def.id, label: def.label, requirement: def.requirement, dueAt: def.dueAt.toISOString(), requiresText: def.requiresText, autoPlateCap: def.autoPlateCap }}
              status={status}
              content={rec?.content ?? null}
              submittedAt={rec?.submittedAt.toISOString() ?? null}
            />
          ))}
        </div>
      </section>

      {/* Check-in + submission */}
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="glass-strong p-6 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Daily check-in</h2>
            {locked && <span className="chip border-cup/40 text-cup">submitted — locked</span>}
          </div>
          {locked ? (
            <p className="text-sm text-slate-400">Final submission is in, so check-ins are closed. An organizer can reopen it.</p>
          ) : (
            <>
              <p className="mb-4 text-xs text-slate-500">
                20 seconds. Process-visibility, not surveillance — it helps judges see your journey. Mandatory at 6pm each build day.
              </p>
              <CheckInForm />
            </>
          )}
        </section>

        <section className="space-y-6 lg:col-span-2">
          {!locked && (
            <div className="card">
              <h2 className="mb-3 text-sm font-medium">Project details</h2>
              <form action={updateTeam} className="space-y-3">
                <input name="projectName" defaultValue={team.projectName || ""} placeholder="Project name" className="input" />
                <textarea name="description" defaultValue={team.description || ""} placeholder="One-line description" rows={2} className="input resize-none" />
                <input name="repoUrl" defaultValue={team.repoUrl || ""} placeholder="GitHub repo URL" className="input" />
                <button className="btn-ghost w-full">Save</button>
              </form>
            </div>
          )}
          <FinalSubmission team={{ projectName: team.projectName, description: team.description, repoUrl: team.repoUrl, videoUrl: team.videoUrl, submittedAt: team.submittedAt?.toISOString() ?? null }} />
        </section>
      </div>

      {/* Feed */}
      <section>
        <SectionTitle eyebrow="Timeline" title={`Check-in log (${team.checkIns.length})`} />
        <ol className="relative space-y-4 border-l border-white/10 pl-6">
          {team.checkIns.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[30px] top-2 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-400 to-teal-300 shadow-[0_0_10px_rgba(139,123,255,0.7)]" />
              <div className="card">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{c.authorName}</span>
                  <span title={fmtDateTime(c.createdAt)}>{relTime(c.createdAt)}</span>
                </div>
                <p className="text-sm">{c.text}</p>
                {c.stuckOn && <p className="mt-1 text-sm text-amber-300">Stuck on: {c.stuckOn}</p>}
                {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-plate underline">attachment ↗</a>}
              </div>
            </li>
          ))}
          {team.checkIns.length === 0 && <li className="text-sm text-slate-500">No check-ins yet. Post your first above.</li>}
        </ol>
      </section>
    </div>
  );
}
