"use client";

import { useActionState, useMemo, useState } from "react";
import { submitScores } from "@/app/(judge)/judge/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/ui/form-status";
import type { RubricCriterion, ScoreEntry } from "@/lib/judging/rubric";
import { weightedTotal, isCardComplete, clampScoreValue } from "@/lib/judging/rubric";
import type { Phase } from "@/lib/enums";

export function RubricForm({
  teamId,
  criteria,
  phase,
  existing,
  disabled,
}: {
  teamId: string;
  criteria: RubricCriterion[];
  phase: Phase;
  existing: ScoreEntry[];
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitScores, null);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of existing) init[s.criterionId] = s.value;
    return init;
  });

  const scores: ScoreEntry[] = useMemo(
    () => Object.entries(values).map(([criterionId, value]) => ({ criterionId, value })),
    [values],
  );
  const complete = isCardComplete(criteria, scores);
  const total = weightedTotal(criteria, scores);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid={`rubric-form-${phase}`}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="phase" value={phase} />
      <input type="hidden" name="scores" value={JSON.stringify(values)} />

      <div className="flex items-center justify-between">
        <h3 className="font-medium uppercase tracking-eyebrow text-primary">{phase} scoring</h3>
        {total !== null ? (
          <span
            className="chip font-mono text-primary"
            data-testid={`weighted-total-${phase}`}
          >
            {total.toFixed(1)} / 100
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Incomplete</span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {criteria.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={`score-${phase}-${c.id}`}>
                {c.label} <span className="text-xs text-muted-foreground">(weight {c.weight})</span>
              </Label>
              <span className="font-mono text-xs tabular-nums text-primary">
                {values[c.id] ?? 0} / {c.scaleMax}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.description}</p>
            <input
              id={`score-${phase}-${c.id}`}
              type="range"
              min={0}
              max={c.scaleMax}
              step={1}
              value={values[c.id] ?? 0}
              disabled={disabled}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [c.id]: clampScoreValue(Number(e.target.value), c.scaleMax) }))
              }
              data-testid={`slider-${phase}-${c.id}`}
              className="mission-slider"
            />
          </div>
        ))}
      </div>

      <Button
        type="submit"
        variant="mission"
        disabled={disabled || pending || !complete}
        data-testid={`submit-scores-${phase}`}
      >
        {pending ? "Saving…" : complete ? "Save scores" : "Score every criterion to save"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
