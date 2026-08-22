"use client";

import { useActionState } from "react";
import { generateAiReview, submitAiFeedback } from "@/app/(judge)/judge/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import type { AiReviewRow } from "@/lib/judging/queries";

export function AiReviewPanel({ teamId, review }: { teamId: string; review: AiReviewRow | null }) {
  const [genState, genAction, genPending] = useActionState<ActionResult | null, FormData>(generateAiReview, null);
  const [fbState, fbAction, fbPending] = useActionState<ActionResult | null, FormData>(submitAiFeedback, null);

  return (
    <div className="flex flex-col gap-3 glass p-4" data-testid="ai-review-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">AI process summary</h3>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          Aid, not a score — read it beside the evidence below
        </span>
      </div>

      {review ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>{review.summary}</p>
          {review.strengths.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">Strengths</p>
              <ul className="list-disc pl-5">
                {review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {review.improvements.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">Gaps</p>
              <ul className="list-disc pl-5">
                {review.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {review.model} · {formatWhen(review.generatedAt)}
            {review.processNotes ? ` · ${review.processNotes}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No summary generated yet.</p>
      )}

      <form action={genAction}>
        <input type="hidden" name="teamId" value={teamId} />
        <Button type="submit" variant="outline" size="sm" disabled={genPending} data-testid="generate-ai-review">
          {genPending ? "Generating…" : review ? "Regenerate" : "Generate summary"}
        </Button>
        <FormStatus state={genState} />
      </form>

      {review ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Was this useful?</span>
          <form action={fbAction}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="helpful" value="true" />
            <Button type="submit" size="sm" variant="ghost" disabled={fbPending} data-testid="ai-feedback-yes">
              Yes
            </Button>
          </form>
          <form action={fbAction}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="helpful" value="false" />
            <Button type="submit" size="sm" variant="ghost" disabled={fbPending} data-testid="ai-feedback-no">
              No
            </Button>
          </form>
          <FormStatus state={fbState} />
        </div>
      ) : null}
    </div>
  );
}
