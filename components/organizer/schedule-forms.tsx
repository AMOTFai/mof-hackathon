"use client";

import { useActionState } from "react";
import {
  createScheduleItem,
  deleteScheduleItem,
  updateScheduleItem,
} from "@/app/(organizer)/organizer/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { FormStatus } from "@/components/ui/form-status";
import { SCHEDULE_KINDS } from "@/lib/enums";
import { toDatetimeLocal } from "@/lib/datetime";
import type { ScheduleItem } from "@/lib/comms/queries";
import type { ActionResult } from "@/lib/forms";

function Fields({ item }: { item?: ScheduleItem }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`title-${item?.id ?? "new"}`}>Title</Label>
        <Input id={`title-${item?.id ?? "new"}`} name="title" required defaultValue={item?.title} maxLength={160} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`kind-${item?.id ?? "new"}`}>Kind</Label>
          <select
            id={`kind-${item?.id ?? "new"}`}
            name="kind"
            defaultValue={item?.kind ?? "session"}
            className="flex h-9 w-full rounded-md border border-input bg-panel px-3 text-sm"
          >
            {SCHEDULE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`location-${item?.id ?? "new"}`}>Location</Label>
          <Input id={`location-${item?.id ?? "new"}`} name="location" defaultValue={item?.location ?? ""} maxLength={160} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`starts-${item?.id ?? "new"}`}>Starts</Label>
          <Input
            id={`starts-${item?.id ?? "new"}`}
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={item ? toDatetimeLocal(item.startsAt) : ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ends-${item?.id ?? "new"}`}>Ends</Label>
          <Input
            id={`ends-${item?.id ?? "new"}`}
            name="ends_at"
            type="datetime-local"
            defaultValue={item?.endsAt ? toDatetimeLocal(item.endsAt) : ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`desc-${item?.id ?? "new"}`}>Description</Label>
        <Textarea id={`desc-${item?.id ?? "new"}`} name="description" defaultValue={item?.description ?? ""} maxLength={1000} />
      </div>
    </>
  );
}

export function CreateScheduleForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createScheduleItem, null);
  return (
    <Panel variant="glow">
      <form action={action} className="flex flex-col gap-3">
        <h3 className="font-display font-medium">Add session</h3>
        <input type="hidden" name="eventId" value={eventId} />
        <Fields />
        <Button type="submit" variant="mission" disabled={pending} data-testid="add-schedule">
          {pending ? "Adding…" : "Add to schedule"}
        </Button>
        <FormStatus state={state} />
      </form>
    </Panel>
  );
}

export function EditScheduleItem({ item }: { item: ScheduleItem }) {
  const [updateState, updateAction, updatePending] = useActionState<ActionResult | null, FormData>(
    updateScheduleItem,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionResult | null, FormData>(
    deleteScheduleItem,
    null,
  );
  return (
    <Panel>
      <form action={updateAction} className="flex flex-col gap-3">
        <input type="hidden" name="eventId" value={item.eventId} />
        <input type="hidden" name="itemId" value={item.id} />
        <Fields item={item} />
        <Button type="submit" disabled={updatePending}>
          {updatePending ? "Saving…" : "Save"}
        </Button>
        <FormStatus state={updateState} />
      </form>
      <form action={deleteAction} className="mt-3">
        <input type="hidden" name="eventId" value={item.eventId} />
        <input type="hidden" name="itemId" value={item.id} />
        <Button type="submit" variant="outline" disabled={deletePending} data-testid={`delete-schedule-${item.id}`}>
          {deletePending ? "Removing…" : "Remove"}
        </Button>
        <FormStatus state={deleteState} />
      </form>
    </Panel>
  );
}
