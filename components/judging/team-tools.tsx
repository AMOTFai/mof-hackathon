"use client";

import { useActionState } from "react";
import { declareConflict, flagForDiscussion, saveJudgeNote } from "@/app/(judge)/judge/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/ui/form-status";

export function ConflictDeclare({ teamId, hasConflict }: { teamId: string; hasConflict: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(declareConflict, null);
  if (hasConflict) {
    return (
      <p className="glass border-warning/50 bg-warning/10 p-3 text-sm text-warning">
        You&apos;ve declared a conflict on this team — you are recused and your scores were removed.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 glass p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <Label htmlFor="conflict-reason">Declare a conflict of interest</Label>
      <Textarea id="conflict-reason" name="reason" maxLength={500} rows={2} placeholder="Reason (optional)" />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} data-testid="declare-conflict">
        {pending ? "Declaring…" : "Declare conflict — recuse me"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function DiscussionFlag({ teamId, defaultNote }: { teamId: string; defaultNote: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(flagForDiscussion, null);
  return (
    <form action={action} className="flex flex-col gap-2 glass p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <Label htmlFor="discussion-note">Flag for panel discussion</Label>
      <Textarea id="discussion-note" name="note" maxLength={1000} rows={2} defaultValue={defaultNote ?? ""} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} data-testid="flag-discussion">
        {pending ? "Saving…" : "Flag"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function JudgeNotes({ teamId, defaultBody }: { teamId: string; defaultBody: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveJudgeNote, null);
  return (
    <form action={action} className="flex flex-col gap-2 glass p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <Label htmlFor="judge-note">Private notes (visible to you and staff only)</Label>
      <Textarea id="judge-note" name="body" maxLength={4000} rows={4} defaultValue={defaultBody} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} data-testid="save-note">
        {pending ? "Saving…" : "Save note"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
