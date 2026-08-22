"use client";

import { useActionState } from "react";
import { completeErasure } from "@/app/(organizer)/organizer/erasure-actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";

export type ErasureQueueRow = { id: string; userId: string; userEmail: string; scope: string; requestedAt: string };

export function ErasureQueue({ requests, isAdmin }: { requests: ErasureQueueRow[]; isAdmin: boolean }) {
  if (requests.length === 0) return <p className="text-sm text-muted-foreground">No pending erasure requests.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {requests.map((r) => (
        <li key={r.id} className="flex items-center justify-between glass p-3 text-sm" data-testid={`erasure-queue-${r.id}`}>
          <span>
            {r.userEmail} — {r.scope} — requested {formatWhen(r.requestedAt)}
          </span>
          {isAdmin ? <CompleteButton requestId={r.id} /> : <span className="text-xs text-muted-foreground">Admin only</span>}
        </li>
      ))}
    </ul>
  );
}

function CompleteButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(completeErasure, null);
  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending} data-testid={`complete-erasure-${requestId}`}>
        {pending ? "Processing…" : "Complete erasure"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
