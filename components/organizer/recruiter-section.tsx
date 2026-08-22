"use client";

import { useActionState } from "react";
import { createRecruiterOrg, inviteRecruiter } from "@/app/(organizer)/organizer/setup/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/ui/form-status";

export type RecruiterOrgRow = { id: string; name: string; hiringIntent: string; dpaSignedAt: string | null };

export function RecruiterSection({ eventId, orgs }: { eventId: string; orgs: RecruiterOrgRow[] }) {
  const [orgState, orgAction, orgPending] = useActionState<ActionResult | null, FormData>(createRecruiterOrg, null);
  const [inviteState, inviteAction, invitePending] = useActionState<ActionResult | null, FormData>(inviteRecruiter, null);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1 text-sm">
        {orgs.map((o) => (
          <li key={o.id} data-testid={`recruiter-org-${o.id}`}>
            {o.name} — {o.hiringIntent} {o.dpaSignedAt ? "· DPA signed" : "· DPA NOT signed (no access)"}
          </li>
        ))}
        {orgs.length === 0 ? <p className="text-muted-foreground">No recruiter orgs yet.</p> : null}
      </ul>

      <form action={orgAction} className="grid gap-2 glass p-3 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="org-name">Org name</Label>
          <Input id="org-name" name="name" required maxLength={120} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="org-domain">Domain</Label>
          <Input id="org-domain" name="domain" maxLength={120} placeholder="example.com" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="org-intent">Hiring intent</Label>
          <Input id="org-intent" name="hiringIntent" required maxLength={200} placeholder="New grad engineers" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="dpaSigned" /> Data Processing Agreement signed (required before any access works)
        </label>
        <Button type="submit" disabled={orgPending} className="sm:col-span-2" data-testid="add-recruiter-org">
          {orgPending ? "Adding…" : "Add recruiter org"}
        </Button>
        <FormStatus state={orgState} />
      </form>

      <form action={inviteAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="recruiter-email">Invite recruiter by email</Label>
          <Input id="recruiter-email" name="email" type="email" required data-testid="invite-recruiter-email" />
        </div>
        <Button type="submit" disabled={invitePending} data-testid="invite-recruiter-submit">
          {invitePending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <FormStatus state={inviteState} />
    </div>
  );
}
