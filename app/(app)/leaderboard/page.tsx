import Link from "next/link";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/app/actions";
import { finalWeighted } from "@/lib/rubric";
import { isPlateCapped, isDisqualified, type CheckpointDef } from "@/lib/checkpoints";
import { BracketChip, ScoreRing, SectionTitle } from "@/components/ui";

export default async function LeaderboardPage() {
  await assertStaff();
  const [teams, cpsRaw] = await Promise.all([
    prisma.team.findMany({ include: { scores: true, checkpoints: true }, orderBy: { name: "asc" } }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
  ]);
  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));

  const ranked = teams
    .map((t) => {
      const recs = t.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
      const capped = isPlateCapped(defs, recs);
      const scores = t.scores.map((s) => ({ criterion: s.criterion, value: s.value, phase: s.phase, judgeId: s.judgeId }));
      return { id: t.id, name: t.name, project: t.projectName, bracket: capped ? "plate" : t.bracket, capped, dq: isDisqualified(defs, recs), final: finalWeighted(scores) };
    })
    .sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  const brackets: [string, string][] = [["cup", "Cup"], ["plate", "Plate"], ["unassigned", "Unassigned"]];

  return (
    <div className="space-y-8">
      <SectionTitle eyebrow="Standings" title="Leaderboard" action={<Link href="/judge" className="text-xs text-teal-300 hover:underline">Judging →</Link>} />
      {brackets.map(([key, label]) => {
        const list = ranked.filter((t) => t.bracket === key);
        if (list.length === 0) return null;
        return (
          <section key={key}>
            <div className="mb-3 flex items-center gap-2">
              <BracketChip bracket={key} />
              <h2 className="text-sm font-medium text-slate-300">{label} bracket</h2>
            </div>
            <div className="space-y-2">
              {list.map((t, i) => (
                <Link key={t.id} href={`/judge/${t.id}`} className="glass flex items-center justify-between p-4 transition-colors hover:border-white/20">
                  <div className="flex items-center gap-4">
                    <span className="w-6 text-center font-mono text-lg text-slate-500">{i + 1}</span>
                    <div>
                      <p className="font-medium">{t.name} {t.dq && <span className="chip border-rose-500/50 text-rose-200">DQ risk</span>}</p>
                      <p className="text-xs text-slate-500">{t.project || "—"}</p>
                    </div>
                  </div>
                  <ScoreRing value={t.final} size={54} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
