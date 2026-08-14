"use client";

import { useState, useTransition } from "react";
import { saveScores } from "@/app/actions";
import { TOTAL_POINTS } from "@/lib/rubric";

type Rubric = readonly { key: string; label: string; weight: number; hint: string }[];
type ScoreVal = { value: number; comment: string | null };

export default function ScoreForm({
  teamId,
  rubric,
  prepanel,
  live,
  panelAvgPrepanel,
  panelAvgLive,
  disabled,
}: {
  teamId: string;
  rubric: Rubric;
  prepanel: Record<string, ScoreVal>;
  live: Record<string, ScoreVal>;
  panelAvgPrepanel: Record<string, number | null>;
  panelAvgLive: Record<string, number | null>;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<"prepanel" | "live">("prepanel");
  const panelAvg = phase === "prepanel" ? panelAvgPrepanel : panelAvgLive;
  const [pending, start] = useTransition();
  const [vals, setVals] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(rubric.map((r) => [r.key, (phase === "prepanel" ? prepanel : live)[r.key]?.value ?? ""])),
  );

  function switchPhase(p: "prepanel" | "live") {
    setPhase(p);
    const src = p === "prepanel" ? prepanel : live;
    setVals(Object.fromEntries(rubric.map((r) => [r.key, src[r.key]?.value ?? ""])));
  }

  const weightedTotal = rubric.reduce((sum, r) => {
    const v = vals[r.key];
    return sum + (typeof v === "number" ? (v / 10) * r.weight : 0);
  }, 0);

  if (disabled) {
    return (
      <div className="glass p-5">
        <h2 className="mb-1 text-sm font-medium">Scoring</h2>
        <p className="text-sm text-rose-300">You've declared a conflict on this team, so scoring is disabled.</p>
      </div>
    );
  }

  const current = phase === "prepanel" ? prepanel : live;

  return (
    <div className="glass-strong p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Your score</h2>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5 text-xs">
          {(["prepanel", "live"] as const).map((p) => (
            <button key={p} onClick={() => switchPhase(p)} className={`rounded-md px-2.5 py-1 ${phase === p ? "bg-white/10 text-slate-100" : "text-slate-400"}`}>
              {p === "prepanel" ? "Pre-panel" : "Live pitch"}
            </button>
          ))}
        </div>
      </div>

      <form action={(fd) => start(() => saveScores(fd))} className="space-y-4">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="phase" value={phase} />
        {rubric.map((r) => (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-medium" htmlFor={`score__${r.key}`}>
                {r.label} <span className="text-xs text-slate-500">/{r.weight}</span>
              </label>
              {panelAvg[r.key] != null && <span className="text-xs text-slate-500">panel {panelAvg[r.key]!.toFixed(1)}</span>}
            </div>
            <p className="mb-1.5 text-xs text-slate-500">{r.hint}</p>
            <div className="flex items-center gap-2">
              <input
                id={`score__${r.key}`}
                name={`score__${r.key}`}
                type="number"
                min={1}
                max={10}
                value={vals[r.key]}
                onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                placeholder="1-10"
                className="input w-20"
              />
              <input name={`comment__${r.key}`} defaultValue={current[r.key]?.comment ?? ""} placeholder="Comment (optional)" className="input flex-1" />
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <span className="text-sm text-slate-400">Weighted total</span>
          <span className="font-mono text-xl font-semibold glow-text">{weightedTotal.toFixed(1)}<span className="text-sm text-slate-500">/{TOTAL_POINTS}</span></span>
        </div>

        <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : `Save ${phase === "prepanel" ? "pre-panel" : "live"} score`}</button>
      </form>
    </div>
  );
}
