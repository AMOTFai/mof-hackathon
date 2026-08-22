"use client";

import { useActionState } from "react";
import { createCheckIn } from "@/app/(participant)/dashboard/checkins-actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/ui/form-status";
import type { MilestoneDef } from "@/lib/checkins/status";

export function CheckInComposer({
  teamId,
  milestones,
  locked,
}: {
  teamId: string;
  milestones: MilestoneDef[];
  locked: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createCheckIn, null);

  return (
    <form action={action} className="flex flex-col gap-3 glass p-4" data-testid="checkin-composer">
      <h3 className="font-medium">Log a check-in</h3>
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="checkin-body">What happened</Label>
        <Textarea id="checkin-body" name="body" required maxLength={4000} rows={3} data-testid="checkin-body" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkin-milestone">Milestone (optional)</Label>
          <select
            id="checkin-milestone"
            name="milestoneId"
            className="flex h-9 w-full rounded-md border border-input bg-panel px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue=""
            data-testid="checkin-milestone"
          >
            <option value="">None</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkin-link">Link (optional)</Label>
          <Input id="checkin-link" name="linkUrl" type="url" placeholder="https://" maxLength={2048} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="checkin-blockers">Blockers (optional)</Label>
        <Textarea id="checkin-blockers" name="blockers" maxLength={2000} rows={2} />
      </div>
      <Button type="submit" disabled={pending || locked} data-testid="checkin-submit">
        {pending ? "Logging…" : locked ? "Submission locked" : "Log check-in"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
