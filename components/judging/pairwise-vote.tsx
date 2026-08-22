"use client";

import { useActionState } from "react";
import { submitPairwiseVote } from "@/app/(judge)/judge/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";

export function PairwiseVote({
  eventId,
  teamA,
  teamB,
}: {
  eventId: string;
  teamA: { id: string; name: string; projectName: string | null };
  teamB: { id: string; name: string; projectName: string | null };
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitPairwiseVote, null);

  return (
    <div className="flex flex-col gap-4" data-testid="pairwise-vote">
      <p className="text-sm text-muted-foreground">Which team is doing the stronger work overall?</p>
      <div className="relative grid gap-3 sm:grid-cols-2">
        {[
          { winner: teamA, loser: teamB },
          { winner: teamB, loser: teamA },
        ].map(({ winner, loser }) => (
          <form key={winner.id} action={action}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="winnerId" value={winner.id} />
            <input type="hidden" name="loserId" value={loser.id} />
            <Button
              type="submit"
              variant="outline"
              disabled={pending}
              className="h-auto w-full flex-col items-start gap-1 whitespace-normal p-5 text-left hover:border-primary/50 hover:bg-primary/5"
              data-testid={`vote-${winner.id}`}
            >
              <span className="font-display font-medium">{winner.name}</span>
              {winner.projectName ? (
                <span className="text-xs text-muted-foreground">{winner.projectName}</span>
              ) : null}
            </Button>
          </form>
        ))}
        <span className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-panel-border bg-background px-2 py-1 font-mono text-xs uppercase tracking-eyebrow text-muted-foreground sm:block">
          vs
        </span>
      </div>
      <FormStatus state={state} />
    </div>
  );
}
