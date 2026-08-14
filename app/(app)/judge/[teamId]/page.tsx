import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertStaff, generateAIReview, syncGithub } from "@/app/actions";
import { fmtDateTime, relTime, skillsList, fmtBytes } from "@/lib/format";
import { RUBRIC, aggregateWeighted, finalWeighted } from "@/lib/rubric";
import { statusFor, isPlateCapped, isDisqualified, effectiveBracket, type CheckpointDef } from "@/lib/checkpoints";
import { BracketChip, ScoreRing, StatusPill, SectionTitle } from "@/components/ui";
import BracketToggle from "@/components/BracketToggle";
import ScoreForm from "@/components/ScoreForm";
import ConflictToggle from "@/components/ConflictToggle";
import NotePad from "@/components/NotePad";
import VideoEmbed from "@/components/VideoEmbed";

export default async function JudgeTeamPage({ params }: { params: { teamId: string } }) {
  const judge = await assertStaff();

  const [team, cpsRaw, myNote, myConflict] = await Promise.all([
    prisma.team.findUnique({
      where: { id: params.teamId },
      include: {
        members: true,
        checkIns: { orderBy: { createdAt: "desc" } },
        commits: { orderBy: { committedAt: "desc" }, take: 30 },
        apiCalls: { orderBy: { createdAt: "desc" }, take: 200 },
        aiReview: true,
        scores: { include: { judge: true } },
        checkpoints: true,
      },
    }),
    prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
    prisma.judgeNote.findUnique({ where: { teamId_judgeId: { teamId: params.teamId, judgeId: judge.id } } }),
    prisma.conflictOfInterest.findUnique({ where: { judgeId_teamId: { judgeId: judge.id, teamId: params.teamId } } }),
  ]);
  if (!team) notFound();

  const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));
  const recs = team.checkpoints.map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
  const capped = isPlateCapped(defs, recs);
  const dq = isDisqualified(defs, recs);

  const allScores = team.scores.map((s) => ({ criterion: s.criterion, value: s.value, phase: s.phase, judgeId: s.judgeId }));
  const final = finalWeighted(allScores);

  // This judge's own score maps by phase.
  const mine = team.scores.filter((s) => s.judgeId === judge.id);
  const prepanel = Object.fromEntries(mine.filter((s) => s.phase === "prepanel").map((s) => [s.criterion, { value: s.value, comment: s.comment }]));
  const live = Object.fromEntries(mine.filter((s) => s.phase === "live").map((s) => [s.criterion, { value: s.value, comment: s.comment }]));

  // Panel average per criterion (other judges), computed per phase so the live
  // view compares against live peers, not stale pre-panel numbers.
  const panelAvgFor = (phase: string) => {
    const out: Record<string, number | null> = {};
    for (const r of RUBRIC) {
      const others = team.scores.filter((s) => s.criterion === r.key && s.phase === phase && s.judgeId !== judge.id).map((s) => s.value);
      out[r.key] = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
    }
    return out;
  };
  const panelAvgPrepanel = panelAvgFor("prepanel");
  const panelAvgLive = panelAvgFor("live");

  const strengths: string[] = team.aiReview ? JSON.parse(team.aiReview.strengths) : [];
  const improvements: string[] = team.aiReview ? JSON.parse(team.aiReview.improvements) : [];

  // API activity summary — a visibility signal alongside commits/check-ins.
  const api = team.apiCalls;
  const apiProviders = Array.from(new Set(api.map((c) => c.provider)));
  const apiModels = Array.from(new Set(api.map((c) => c.model).filter(Boolean))) as string[];
  const apiFirst = api.length ? api[api.length - 1].createdAt : null;
  const apiLast = api.length ? api[0].createdAt : null;
  const apiContentOn = team.logApiContent;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/judge" className="text-xs text-slate-400 hover:text-slate-100">← All teams</Link>
        <div className="flex flex-wrap items-center gap-3">
          <ConflictToggle teamId={team.id} active={!!myConflict} />
          <BracketToggle teamId={team.id} current={effectiveBracket(team.bracket, capped)} capped={capped} />
        </div>
      </div>

      {/* Header */}
      <div className="glass-strong flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <BracketChip bracket={capped ? "plate" : team.bracket} />
            {capped && <span className="chip border-rose-400/40 bg-rose-400/10 text-rose-300">Plate-capped</span>}
            {dq && <span className="chip border-rose-500/50 bg-rose-500/15 text-rose-200">DQ risk — missed final</span>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{team.projectName || "—"}{team.description ? ` · ${team.description}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="eyebrow mb-1">Final (weighted)</p>
            <p className="font-mono text-xs text-slate-500">pre-panel {aggregateWeighted(allScores, "prepanel")?.toFixed(1) ?? "—"} · live {aggregateWeighted(allScores, "live")?.toFixed(1) ?? "—"}</p>
          </div>
          <ScoreRing value={final} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column: process trail */}
        <div className="space-y-6 lg:col-span-3">
          {/* AI review */}
          <section className="glass-strong p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">AI log review <span className="text-xs text-slate-500">judging aid</span></h2>
              <form action={generateAIReview}>
                <input type="hidden" name="teamId" value={team.id} />
                <button className="btn-ghost px-3 py-1.5 text-xs">{team.aiReview ? "Regenerate" : "Generate"}</button>
              </form>
            </div>
            {team.aiReview ? (
              <div className="space-y-3">
                <p className="text-sm">{team.aiReview.summary}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 eyebrow text-teal-300">Did well</p>
                    <ul className="space-y-1 text-sm">{strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="mb-1 eyebrow text-amber-300">Could be stronger</p>
                    <ul className="space-y-1 text-sm">{improvements.map((s, i) => <li key={i}>• {s}</li>)}</ul>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{team.aiReview.generatedByAI ? "Generated by Claude" : "Heuristic (no API key)"} · {relTime(team.aiReview.createdAt)}. A judging aid, not a score.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No review yet. Generate one to summarize this team's process + checkpoint discipline.</p>
            )}
          </section>

          {/* Checkpoint timeline */}
          <section className="glass p-5">
            <h2 className="mb-3 font-medium">Checkpoint discipline</h2>
            <div className="space-y-2">
              {defs.map((d) => {
                const rec = recs.find((r) => r.checkpointId === d.id);
                const st = statusFor(d, rec);
                return (
                  <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{d.label}</p>
                      {rec?.content && <p className="mt-0.5 text-xs text-slate-400">{rec.content}</p>}
                      <p className="mt-0.5 text-[11px] text-slate-600">due {fmtDateTime(d.dueAt)}{rec ? ` · submitted ${fmtDateTime(rec.submittedAt)}` : ""}</p>
                    </div>
                    <StatusPill status={st} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Check-in log */}
          <section>
            <SectionTitle eyebrow="Timeline" title={`Check-in log (${team.checkIns.length})`} />
            <ol className="space-y-3">
              {team.checkIns.map((c) => (
                <li key={c.id} className="card">
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{c.authorName}</span><span>{fmtDateTime(c.createdAt)}</span></div>
                  <p className="text-sm">{c.text}</p>
                  {c.stuckOn && <p className="mt-1 text-sm text-amber-300">Stuck on: {c.stuckOn}</p>}
                  {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="text-xs text-plate underline">attachment ↗</a>}
                </li>
              ))}
              {team.checkIns.length === 0 && <li className="text-sm text-slate-500">No check-ins logged.</li>}
            </ol>
          </section>

          {/* GitHub */}
          <section className="glass p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">GitHub activity <span className="text-xs text-slate-500">{team.commits.length}</span></h2>
              {team.repoUrl && (
                <form action={syncGithub}><input type="hidden" name="teamId" value={team.id} /><button className="btn-ghost px-3 py-1.5 text-xs">Sync commits</button></form>
              )}
            </div>
            {!team.repoUrl && <p className="text-sm text-slate-500">No repo linked.</p>}
            {team.repoUrl && (
              <>
                <a href={team.repoUrl} target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs text-plate underline">{team.repoUrl} ↗</a>
                <ul className="space-y-1">
                  {team.commits.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 text-sm">
                      <span className="truncate">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-teal-300">{c.message}</a> : c.message}</span>
                      <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(c.committedAt)}</span>
                    </li>
                  ))}
                  {team.commits.length === 0 && <li className="text-sm text-slate-500">No commits pulled — click Sync.</li>}
                </ul>
              </>
            )}
          </section>

          {/* API activity — proxied AI calls, a visibility signal (not a score). */}
          <section className="glass p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">API activity <span className="text-xs text-slate-500">{api.length} calls</span></h2>
              {apiContentOn && <span className="chip border-teal-400/40 bg-teal-400/10 text-teal-300">content logging on</span>}
            </div>

            {api.length === 0 ? (
              <p className="text-sm text-slate-500">
                No proxied AI calls. The team may not have routed through the proxy — absence is itself a
                signal to weigh against their commits and check-ins, not an automatic penalty.
              </p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] py-2">
                    <p className="font-mono text-lg">{api.length}</p>
                    <p className="text-[11px] text-slate-500">calls</p>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] py-2">
                    <p className="font-mono text-lg">{apiProviders.length}</p>
                    <p className="text-[11px] text-slate-500">providers</p>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] py-2">
                    <p className="font-mono text-lg">{team.commits.length}</p>
                    <p className="text-[11px] text-slate-500">commits</p>
                  </div>
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  {apiProviders.join(", ")}
                  {apiModels.length ? ` · ${apiModels.slice(0, 4).join(", ")}${apiModels.length > 4 ? "…" : ""}` : ""}
                  {apiFirst && apiLast ? ` · ${fmtDateTime(apiFirst)} → ${fmtDateTime(apiLast)}` : ""}
                </p>
                <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {api.slice(0, 60).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="chip shrink-0">{c.provider}</span>
                        <span className="truncate text-slate-300">{c.model ?? "—"}</span>
                        {c.status >= 400 || c.status === 0 ? <span className="shrink-0 text-xs text-rose-300">{c.status || "err"}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {fmtBytes(c.requestSize)}↑ {fmtBytes(c.responseSize)}↓ · {fmtDateTime(c.createdAt)}
                      </span>
                    </li>
                  ))}
                  {api.length > 60 && <li className="pt-1 text-xs text-slate-600">+ {api.length - 60} earlier calls</li>}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Right column: video, team, scoring, notes */}
        <div className="space-y-6 lg:col-span-2">
          <section className="glass p-5">
            <h2 className="mb-3 text-sm font-medium">Final submission</h2>
            {team.submittedAt ? (
              <div className="space-y-3">
                {team.videoUrl ? <VideoEmbed url={team.videoUrl} /> : <p className="text-sm text-slate-500">No video link.</p>}
                <p className="text-xs text-slate-500">Submitted {fmtDateTime(team.submittedAt)}</p>
                {team.repoUrl && <a href={team.repoUrl} target="_blank" rel="noreferrer" className="text-sm text-plate underline">Repo ↗</a>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Not submitted yet (final due Saturday).</p>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="mb-3 text-sm font-medium">Team</h2>
            <div className="space-y-2">
              {team.members.map((m) => (
                <div key={m.id} className="text-sm">
                  <p className="font-medium">{m.name} <span className="text-xs text-slate-500">{m.university || ""}</span></p>
                  <div className="mt-0.5 flex flex-wrap gap-1">{skillsList(m.skills).map((s) => <span key={s} className="chip">{s}</span>)}</div>
                </div>
              ))}
            </div>
          </section>

          <ScoreForm
            teamId={team.id}
            rubric={RUBRIC}
            prepanel={prepanel}
            live={live}
            panelAvgPrepanel={panelAvgPrepanel}
            panelAvgLive={panelAvgLive}
            disabled={!!myConflict}
          />

          <NotePad teamId={team.id} initial={myNote?.text ?? ""} />
        </div>
      </div>
    </div>
  );
}
