"use client";

import { useActionState, useState } from "react";
import { submitCalibration } from "@/app/(judge)/judge/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";
import type { RubricCriterion } from "@/lib/judging/rubric";
import { clampScoreValue, isCardComplete } from "@/lib/judging/rubric";
import type { CalibrationSample } from "@/lib/judging/queries";

export function CalibrationForm({ sample, criteria }: { sample: CalibrationSample; criteria: RubricCriterion[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitCalibration, null);
  const [values, setValues] = useState<Record<string, number>>({});
  const complete = isCardComplete(
    criteria,
    Object.entries(values).map(([criterionId, value]) => ({ criterionId, value })),
  );

  const content = sample.content as { title?: string; description?: string } | null;

  return (
    <Panel variant="glow">
      <form action={action} className="flex flex-col gap-4" data-testid={`calibration-${sample.id}`}>
        <input type="hidden" name="sampleId" value={sample.id} />
        <input type="hidden" name="scores" value={JSON.stringify(values)} />

        <div>
          <h3 className="font-display font-medium">{sample.title}</h3>
          {content?.description ? <p className="mt-1 text-sm text-muted-foreground">{content.description}</p> : null}
        </div>

        <div className="flex flex-col gap-4">
          {criteria.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`cal-${sample.id}-${c.id}`}>{c.label}</Label>
                <span className="font-mono text-xs tabular-nums text-primary">
                  {values[c.id] ?? 0} / {c.scaleMax}
                </span>
              </div>
              <input
                id={`cal-${sample.id}-${c.id}`}
                type="range"
                min={0}
                max={c.scaleMax}
                step={1}
                value={values[c.id] ?? 0}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [c.id]: clampScoreValue(Number(e.target.value), c.scaleMax) }))
                }
                className="mission-slider"
                data-testid={`cal-slider-${sample.id}-${c.id}`}
              />
            </div>
          ))}
        </div>

        <Button type="submit" variant="mission" disabled={pending || !complete} data-testid={`submit-calibration-${sample.id}`}>
          {pending ? "Submitting…" : "Submit calibration"}
        </Button>
        <FormStatus state={state} />
      </form>
    </Panel>
  );
}
