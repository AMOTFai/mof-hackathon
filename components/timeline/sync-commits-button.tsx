"use client";

import { useActionState } from "react";
import { syncCommits } from "@/app/(participant)/dashboard/github-actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";

export function SyncCommitsButton({ teamId, hasRepo }: { teamId: string; hasRepo: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(syncCommits, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || !hasRepo} data-testid="sync-commits">
        {pending ? "Syncing…" : "Sync commits"}
      </Button>
      {!hasRepo ? (
        <p className="text-xs text-muted-foreground">Add a repo URL on the submission page to enable syncing.</p>
      ) : null}
      <FormStatus state={state} />
    </form>
  );
}
