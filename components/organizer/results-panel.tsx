"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { computeResults, setResultsPublished, setTeamBracket } from "@/app/(organizer)/organizer/results/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";
import { cn } from "@/lib/utils";
import { BRACKETS } from "@/lib/enums";

export type ResultRow = {
  teamId: string;
  teamName: string;
  rubricScore: number | null;
  pairwiseRank: number | null;
  finalRank: number | null;
  bracket: string;
  published: boolean;
};

const BRACKET_STYLE: Record<string, string> = {
  cup: "border-success/50 bg-success/10 text-success",
  plate: "border-warning/50 bg-warning/10 text-warning",
  unassigned: "border-panel-border bg-panel text-muted-foreground",
  disqualified: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function ResultsPanel({ eventId, rows }: { eventId: string; rows: ResultRow[] }) {
  const [computeState, computeAction, computePending] = useActionState<ActionResult | null, FormData>(computeResults, null);
  const [publishState, publishAction, publishPending] = useActionState<ActionResult | null, FormData>(
    setResultsPublished,
    null,
  );
  const anyPublished = rows.some((r) => r.published);
  const sorted = rows.slice().sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action={computeAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <Button type="submit" variant="mission" disabled={computePending} data-testid="compute-results">
            {computePending ? "Computing…" : "Compute results"}
          </Button>
        </form>
        <form action={publishAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="published" value={(!anyPublished).toString()} />
          <Button type="submit" variant="outline" disabled={publishPending} data-testid="toggle-publish">
            {publishPending ? "…" : anyPublished ? "Unpublish" : "Publish to teams"}
          </Button>
        </form>
        {anyPublished ? <span className="chip border-success/50 text-success">Live for teams</span> : null}
      </div>
      <FormStatus state={computeState} />
      <FormStatus state={publishState} />

      {rows.length === 0 ? (
        <Panel className="text-sm text-muted-foreground">
          No results computed yet — run &ldquo;Compute results&rdquo; once scoring is underway.
        </Panel>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-panel-border">
                <tr>
                  <th className="p-3 text-left font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">Rank</th>
                  <th className="p-3 text-left font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">Team</th>
                  <th className="p-3 text-left font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">Rubric</th>
                  <th className="p-3 text-left font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">Pairwise</th>
                  <th className="p-3 text-left font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">Bracket</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const top3 = r.finalRank !== null && r.finalRank <= 3;
                  return (
                    <motion.tr
                      key={r.teamId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.6) }}
                      className={cn(
                        "border-b border-panel-border last:border-0",
                        top3 && "bg-primary/[0.04]",
                      )}
                      data-testid={`result-${r.teamId}`}
                    >
                      <td className="p-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm tabular-nums",
                            r.finalRank === 1
                              ? "border border-primary bg-primary/15 text-primary font-semibold"
                              : top3
                                ? "border border-primary/40 text-primary"
                                : "text-muted-foreground",
                          )}
                        >
                          {r.finalRank ?? "—"}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{r.teamName}</td>
                      <td className="p-3 font-mono tabular-nums text-foreground">
                        {r.rubricScore !== null ? r.rubricScore.toFixed(1) : "—"}
                      </td>
                      <td className="p-3 font-mono tabular-nums text-muted-foreground">{r.pairwiseRank ?? "—"}</td>
                      <td className="p-3">
                        <BracketSelect teamId={r.teamId} value={r.bracket} />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function BracketSelect({ teamId, value }: { teamId: string; value: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setTeamBracket, null);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <select
        name="bracket"
        defaultValue={value}
        disabled={pending}
        className={cn(
          "h-8 rounded-full border px-3 font-mono text-xs uppercase tracking-eyebrow",
          BRACKET_STYLE[value] ?? BRACKET_STYLE.unassigned,
        )}
        data-testid={`bracket-select-${teamId}`}
      >
        {BRACKETS.map((b) => (
          <option key={b} value={b} className="bg-panel text-foreground">
            {b}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "…" : "Set"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
