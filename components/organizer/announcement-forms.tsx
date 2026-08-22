"use client";

import { useActionState } from "react";
import { postAnnouncement } from "@/app/(organizer)/organizer/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import type { Announcement } from "@/lib/comms/queries";
import type { ActionResult } from "@/lib/forms";

export function PostAnnouncementForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(postAnnouncement, null);
  return (
    <Panel variant="glow">
      <form action={action} className="flex flex-col gap-3">
        <h3 className="font-display font-medium">Broadcast</h3>
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="announcement-body">Message</Label>
          <Textarea id="announcement-body" name="body" required maxLength={4000} data-testid="announcement-body" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="urgent" className="size-4 accent-primary" />
          Urgent
        </label>
        <Button type="submit" variant="mission" disabled={pending} data-testid="send-announcement">
          {pending ? "Sending…" : "Send announcement"}
        </Button>
        <FormStatus state={state} />
      </form>
    </Panel>
  );
}

export function AnnouncementReceipts({
  items,
  participantCount,
}: {
  items: Announcement[];
  participantCount: number;
}) {
  if (items.length === 0) {
    return <Panel className="text-sm text-muted-foreground">No announcements yet.</Panel>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} data-testid={`announcement-${item.id}`}>
          <Panel variant={item.urgent ? "glow" : "default"} className={item.urgent ? "border-warning/50 bg-warning/[0.04]" : undefined}>
            {item.urgent ? <span className="chip border-warning/50 text-warning">Urgent</span> : null}
            <p className="mt-2 text-sm">{item.body}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {formatWhen(item.createdAt)} · {item.readCount ?? 0}/{participantCount} read
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
