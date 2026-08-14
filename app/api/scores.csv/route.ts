import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isStaff } from "@/lib/enums";
import { RUBRIC, weightedForJudge, finalWeighted } from "@/lib/rubric";
import { isPlateCapped, isDisqualified, type CheckpointDef } from "@/lib/checkpoints";

// CSV export of all scores for the final tally. Staff only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return new Response("Forbidden", { status: 403 });

  const [teams, cpsRaw] = await Promise.all([
    prisma.team.findMany({
      include: { scores: { include: { judge: true } }, checkpoints: true },
      orderBy: { name: "asc" },
    }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
  ]);
  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));

  const header = [
    "team", "project", "bracket", "plate_capped", "dq_risk",
    "judge", "phase", ...RUBRIC.map((r) => r.key), "judge_weighted", "team_final_weighted",
  ];
  const rows: string[][] = [];

  for (const t of teams) {
    const recs = t.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
    const capped = isPlateCapped(defs, recs);
    const dq = isDisqualified(defs, recs);
    const allScores = t.scores.map((s) => ({ criterion: s.criterion, value: s.value, phase: s.phase, judgeId: s.judgeId }));
    const teamFinal = finalWeighted(allScores);

    // Group this team's scores by judge+phase.
    const groups = new Map<string, { judge: string; phase: string; vals: typeof allScores }>();
    for (const s of t.scores) {
      const k = `${s.judgeId}:${s.phase}`;
      if (!groups.has(k)) groups.set(k, { judge: s.judge.name, phase: s.phase, vals: [] });
      groups.get(k)!.vals.push({ criterion: s.criterion, value: s.value, phase: s.phase, judgeId: s.judgeId });
    }

    if (groups.size === 0) {
      rows.push([t.name, t.projectName ?? "", capped ? "plate" : t.bracket, String(capped), String(dq), "", "", ...RUBRIC.map(() => ""), "", teamFinal?.toFixed(1) ?? ""]);
      continue;
    }
    for (const g of groups.values()) {
      const byCrit = Object.fromEntries(g.vals.map((v) => [v.criterion, v.value]));
      rows.push([
        t.name, t.projectName ?? "", capped ? "plate" : t.bracket, String(capped), String(dq),
        g.judge, g.phase,
        ...RUBRIC.map((r) => (byCrit[r.key] != null ? String(byCrit[r.key]) : "")),
        weightedForJudge(g.vals).toFixed(1),
        teamFinal?.toFixed(1) ?? "",
      ]);
    }
  }

  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="motf-scores.csv"`,
    },
  });
}
