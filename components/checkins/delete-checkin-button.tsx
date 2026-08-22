"use client";

import { useActionState } from "react";
import { deleteCheckIn } from "@/app/(participant)/dashboard/checkins-actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";

export function DeleteCheckInButton({ checkInId }: { checkInId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteCheckIn, null);
  return (
    <form action={action}>
      <input type="hidden" name="checkInId" value={checkInId} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending} data-testid={`delete-${checkInId}`}>
        {pending ? "…" : "Delete"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
