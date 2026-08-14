import Link from "next/link";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/app/actions";
import { BRACKETS } from "@/lib/enums";
import { finalWeighted, aggregateWeighted } from "@/lib/rubric";
import { statusFor, isPlateCapped, effectiveBracket, type CheckpointDef } from "@/lib/checkpoints";
import { BracketChip, ScoreRing, SectionTitle } from "@/components/ui";

export default async function JudgeDashboard({ searchParams }: { searchParams: { bracket?: string } }) {
  const judge = await assertStaff();
  const filter = searchParams.bracket && BRACKETS.includes(searchParams.bracket as any) ? searchParams.bracket : "all";

  // Fetch all teams and filter by EFFECTIVE bracket in memory — a Plate-capped
  // team stored as "cup"/"unassigned" must show under Plate, not its stored value.
  const [teams, cpsRaw, myAssignments, myConflicts] = await Promise.all([
    prisma.team.findMany({
      include: { members: true, checkIns: true, scores: true, aiReview: true, checkpoints: true },
      orderBy: { name: "asc" },
    }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
    prisma.judgeAssignment.findMany({ where: { judgeId: judge.id } }),
    prisma.conflictOfInterest.findMany({ where: { judgeId: judge.id } }),
  ]);
  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));
  const assignedBrackets = new Set(myAssignments.map((a) => a.bracket));
  const conflictSet = new Set(myConflicts.map((c) => c.teamId));

  const rows = teams
    .map((t) => {
      const recs = t.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
      const capped = isPlateCapped(defs, recs);
      const bracket = effectiveBracket(t.bracket, capped);
      const hit = defs.filter((d) => statusFor(d, recs.find((r) => r.checkpointId === d.id)) === "hit").length;
      const scores = t.scores.map((s) => ({ criterion: s.criterion, value: s.value, phase: s.phase, judgeId: s.judgeId }));
      return {
        ...t,
        capped,
        effBracket: bracket,
        hit,
        final: finalWeighted(scores),
        prepanel: aggregateWeighted(scores, "prepanel"),
        assigned: assignedBrackets.has(bracket),
        conflict: conflictSet.has(t.id),
      };
    })
    .filter((t) => filter === "all" || t.effBracket === filter)
    .sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  const tabs: [string, string][] = [["all", "All"], ["cup", "Cup"], ["plate", "Plate"], ["unassigned", "Unassigned"]];

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Pre-panel review"
        title="Judging"
        action={
          <div className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-sm">
            {tabs.map(([key, label]) => (
              <Link key={key} href={key === "all" ? "/judge" : `/judge?bracket=${key}`} className={`rounded-lg px-3 py-1 ${filter === key ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                {label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <Link key={t.id} href={`/judge/${t.id}`} className="glass group p-5 transition-all hover:border-white/25 hover:bg-white/[0.06]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  <BracketChip bracket={t.effBracket} />
                </div>
                <p className="mt-0.5 text-sm text-slate-400">{t.projectName || "—"}</p>
              </div>
              <ScoreRing value={t.final} size={60} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{t.members.length} members</span>
              <span>{t.hit}/{defs.length} checkpoints</span>
              <span>{t.checkIns.length} check-ins</span>
              {t.submittedAt && <span className="text-teal-300">submitted ✓</span>}
              {t.aiReview && <span>{t.aiReview.generatedByAI ? "AI review" : "heuristic"}</span>}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.conflict && <span className="chip border-rose-400/40 bg-rose-400/10 text-rose-300">Your conflict</span>}
              {t.assigned && !t.conflict && <span className="chip border-teal-400/30 bg-teal-400/10 text-teal-200">Assigned to you</span>}
              {t.capped && <span className="chip border-rose-400/30 text-rose-300">Plate-capped</span>}
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No teams in this bracket.</p>}
      </div>
    </div>
  );
}
