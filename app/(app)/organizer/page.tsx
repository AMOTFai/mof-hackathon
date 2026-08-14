import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOrganizer, reopenSubmission } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";
import { statusFor, isPlateCapped, effectiveBracket, type CheckpointDef } from "@/lib/checkpoints";
import { BracketChip, SectionTitle } from "@/components/ui";
import BracketToggle from "@/components/BracketToggle";
import AssignmentToggle from "@/components/AssignmentToggle";

export default async function OrganizerPage() {
  await requireOrganizer();

  const [teams, judges, assignments, conflicts, cpsRaw] = await Promise.all([
    prisma.team.findMany({ include: { members: true, checkpoints: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "judge" }, orderBy: { name: "asc" } }),
    prisma.judgeAssignment.findMany(),
    prisma.conflictOfInterest.findMany({ include: { judge: true, team: true } }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
  ]);
  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));
  const assignSet = new Set(assignments.map((a) => `${a.judgeId}:${a.bracket}`));

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight glow-text">Organizer console</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/leaderboard" className="btn-ghost">Leaderboard →</Link>
          <a href="/api/scores.csv" className="btn-primary">Export scores CSV ↓</a>
        </div>
      </div>

      {/* Judge assignment */}
      <section className="glass-strong p-6">
        <SectionTitle eyebrow="Panels" title="Judge assignment" action={<span className="text-xs text-slate-500">3-5 judges per bracket</span>} />
        <div className="space-y-2">
          {judges.map((j) => (
            <div key={j.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{j.name}</p>
                <p className="text-xs text-slate-500 capitalize">{j.expertise || "—"}</p>
              </div>
              <div className="flex gap-2">
                {(["cup", "plate"] as const).map((b) => (
                  <AssignmentToggle key={b} judgeId={j.id} bracket={b} active={assignSet.has(`${j.id}:${b}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Teams */}
      <section>
        <SectionTitle eyebrow="Field" title={`Teams (${teams.length})`} />
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Checkpoints</th>
                <th className="px-4 py-3">Bracket</th>
                <th className="px-4 py-3">Submission</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const recs = t.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
                const hit = defs.filter((d) => statusFor(d, recs.find((r) => r.checkpointId === d.id)) === "hit").length;
                const capped = isPlateCapped(defs, recs);
                return (
                  <tr key={t.id} className="border-t border-white/8">
                    <td className="px-4 py-3">
                      <Link href={`/judge/${t.id}`} className="font-medium hover:text-teal-300">{t.name}</Link>
                      <div className="text-xs text-slate-500">{t.projectName || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{t.members.length}</td>
                    <td className="px-4 py-3 text-slate-400">{hit}/{defs.length}{capped && <span className="ml-1 text-rose-300">·capped</span>}</td>
                    <td className="px-4 py-3"><BracketToggle teamId={t.id} current={effectiveBracket(t.bracket, capped)} capped={capped} /></td>
                    <td className="px-4 py-3">
                      {t.submittedAt ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-teal-300">{fmtDateTime(t.submittedAt)}</span>
                          <form action={reopenSubmission}><input type="hidden" name="teamId" value={t.id} /><button className="text-xs text-slate-500 hover:text-amber-300">reopen</button></form>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Conflicts */}
      <section className="glass p-6">
        <SectionTitle eyebrow="Integrity" title="Declared conflicts of interest" />
        {conflicts.length === 0 ? (
          <p className="text-sm text-slate-500">None declared.</p>
        ) : (
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-rose-400/20 bg-rose-400/5 px-4 py-2 text-sm">
                <span><span className="font-medium">{c.judge.name}</span> recused from <span className="font-medium">{c.team.name}</span></span>
                <span className="text-xs text-slate-500">{c.reason || "no reason given"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
