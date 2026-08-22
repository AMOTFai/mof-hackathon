"use client";

import { useActionState } from "react";
import { acceptInvite } from "./actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(acceptInvite, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="mission" disabled={pending} className="w-full" data-testid="accept-invite">
        {pending ? "Joining…" : "Accept invite"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
