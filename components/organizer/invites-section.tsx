"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createInvite, revokeInvite } from "@/app/(organizer)/organizer/setup/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import type { InviteRow } from "@/lib/organizer/queries";

const ROLES = ["participant", "judge", "recruiter"] as const;

export function InvitesSection({
  eventId,
  appUrl,
  invites,
}: {
  eventId: string;
  appUrl: string;
  invites: InviteRow[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createInvite, null);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-3 glass p-3 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" name="role" defaultValue="participant" className="h-9 rounded-md border border-input bg-panel px-2 text-sm">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Lock to email (optional)</Label>
          <Input id="invite-email" name="email" type="email" placeholder="Leave blank for anyone with the link" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-uses">Max uses</Label>
          <Input id="invite-uses" name="maxUses" type="number" min={1} max={500} defaultValue={1} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-expiry">Expires after (days)</Label>
          <Input id="invite-expiry" name="expiresInDays" type="number" min={1} max={365} defaultValue={14} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="mission" disabled={pending} data-testid="create-invite">
            {pending ? "Creating…" : "Create invite link"}
          </Button>
          <FormStatus state={state} />
        </div>
      </form>

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invite links yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.map((invite) => (
            <InviteRowItem key={invite.id} eventId={eventId} appUrl={appUrl} invite={invite} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteRowItem({ eventId, appUrl, invite }: { eventId: string; appUrl: string; invite: InviteRow }) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(revokeInvite, null);
  const link = `${appUrl}/invite/${invite.token}`;
  const expired = new Date(invite.expiresAt).getTime() < Date.now();
  const usedUp = invite.useCount >= invite.maxUses;
  const inactive = Boolean(invite.revokedAt) || expired || usedUp;

  async function onCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 glass p-3" data-testid={`invite-${invite.id}`}>
      <div>
        <div className="flex items-center gap-2">
          <span className="chip">{invite.role}</span>
          {invite.email ? <span className="font-mono text-xs text-muted-foreground">{invite.email}</span> : null}
          {invite.revokedAt ? (
            <span className="chip border-destructive/50 text-destructive">revoked</span>
          ) : expired ? (
            <span className="chip border-destructive/50 text-destructive">expired</span>
          ) : usedUp ? (
            <span className="chip border-warning/50 text-warning">used up</span>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {invite.useCount}/{invite.maxUses} used · expires {formatWhen(invite.expiresAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={inactive}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {!invite.revokedAt ? (
          <form action={action}>
            <input type="hidden" name="id" value={invite.id} />
            <input type="hidden" name="eventId" value={eventId} />
            <Button type="submit" variant="destructive" size="sm" disabled={pending} data-testid={`revoke-invite-${invite.id}`}>
              {pending ? "…" : "Revoke"}
            </Button>
            <FormStatus state={state} />
          </form>
        ) : null}
      </div>
    </li>
  );
}
