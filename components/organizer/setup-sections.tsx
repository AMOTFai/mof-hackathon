"use client";

import { useActionState, useState } from "react";
import {
  assignJudge,
  createCalibrationSample,
  createCriterion,
  createMilestone,
  deleteCalibrationSample,
  deleteCriterion,
  deleteMilestone,
  inviteJudge,
  removeAssignment,
} from "@/app/(organizer)/organizer/setup/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen, toDatetimeLocal } from "@/lib/datetime";
import { MILESTONE_PENALTIES } from "@/lib/enums";
import type {
  AssignmentRow,
  CalibrationSampleRow,
  CriterionRow,
  JudgeRow,
  MilestoneRow,
  TeamRow,
} from "@/lib/organizer/queries";
import { clampScoreValue, isValueInRange } from "@/lib/judging/rubric";

const selectClass = "h-9 rounded-md border border-input bg-panel px-2 text-sm";

export function MilestonesSection({ eventId, milestones }: { eventId: string; milestones: MilestoneRow[] }) {
  const [createState, createAction, createPending] = useActionState<ActionResult | null, FormData>(createMilestone, null);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center justify-between glass p-3 text-sm" data-testid={`milestone-${m.key}`}>
            <div>
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">
                due {formatWhen(m.dueAt)} · {m.penalty}
                {m.required ? " · required" : ""}
              </p>
            </div>
            <DeleteMilestoneButton eventId={eventId} id={m.id} />
          </li>
        ))}
        {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
      </ul>
      <form action={createAction} className="grid gap-2 glass p-3 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-key">Key</Label>
          <Input id="m-key" name="key" required placeholder="v1_slice" className="font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-label">Label</Label>
          <Input id="m-label" name="label" required placeholder="V1 slice" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-due">Due</Label>
          <Input id="m-due" name="due_at" type="datetime-local" required defaultValue={toDatetimeLocal(new Date().toISOString())} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-penalty">Penalty</Label>
          <select id="m-penalty" name="penalty" defaultValue="flag" className={selectClass}>
            {MILESTONE_PENALTIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" defaultChecked /> Required
        </label>
        <input type="hidden" name="sort_order" value={milestones.length} />
        <Button type="submit" disabled={createPending} className="sm:col-span-2" data-testid="add-milestone">
          {createPending ? "Adding…" : "Add milestone"}
        </Button>
        <FormStatus state={createState} />
      </form>
    </div>
  );
}

function DeleteMilestoneButton({ eventId, id }: { eventId: string; id: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteMilestone, null);
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Remove"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function CriteriaSection({ eventId, criteria }: { eventId: string; criteria: CriterionRow[] }) {
  const [createState, createAction, createPending] = useActionState<ActionResult | null, FormData>(createCriterion, null);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {criteria.map((c) => (
          <li key={c.id} className="flex items-center justify-between glass p-3 text-sm" data-testid={`criterion-${c.key}`}>
            <div>
              <p className="font-medium">
                {c.label} <span className="text-xs text-muted-foreground">(weight {c.weight}, 0-{c.scaleMax})</span>
              </p>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
            <DeleteCriterionButton eventId={eventId} id={c.id} />
          </li>
        ))}
        {criteria.length === 0 ? <p className="text-sm text-muted-foreground">No rubric criteria yet — judges can&apos;t score until at least one exists.</p> : null}
      </ul>
      <form action={createAction} className="grid gap-2 glass p-3 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-key">Key</Label>
          <Input id="c-key" name="key" required placeholder="technical" className="font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-label">Label</Label>
          <Input id="c-label" name="label" required placeholder="Technical execution" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="c-desc">Description</Label>
          <Textarea id="c-desc" name="description" required maxLength={500} rows={2} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-weight">Weight</Label>
          <Input id="c-weight" name="weight" type="number" min={1} max={100} defaultValue={30} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-scale">Scale max</Label>
          <Input id="c-scale" name="scale_max" type="number" min={2} max={20} defaultValue={5} required />
        </div>
        <input type="hidden" name="sort_order" value={criteria.length} />
        <Button type="submit" disabled={createPending} className="sm:col-span-2" data-testid="add-criterion">
          {createPending ? "Adding…" : "Add criterion"}
        </Button>
        <FormStatus state={createState} />
      </form>
    </div>
  );
}

function DeleteCriterionButton({ eventId, id }: { eventId: string; id: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteCriterion, null);
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Remove"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function JudgesSection({
  eventId,
  judges,
  teams,
  assignments,
}: {
  eventId: string;
  judges: JudgeRow[];
  teams: TeamRow[];
  assignments: AssignmentRow[];
}) {
  const [inviteState, inviteAction, invitePending] = useActionState<ActionResult | null, FormData>(inviteJudge, null);
  const [assignState, assignAction, assignPending] = useActionState<ActionResult | null, FormData>(assignJudge, null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-sm font-medium">Judges</h4>
        <ul className="flex flex-col gap-1 text-sm">
          {judges.map((j) => (
            <li key={j.userId} data-testid={`judge-${j.userId}`}>
              {j.fullName ?? j.email}
            </li>
          ))}
          {judges.length === 0 ? <p className="text-muted-foreground">No judges invited yet.</p> : null}
        </ul>
        <form action={inviteAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="judge-email">Invite by email</Label>
            <Input id="judge-email" name="email" type="email" required placeholder="judge@example.com" data-testid="invite-judge-email" />
          </div>
          <Button type="submit" disabled={invitePending} data-testid="invite-judge-submit">
            {invitePending ? "Inviting…" : "Invite"}
          </Button>
        </form>
        <FormStatus state={inviteState} />
        <p className="mt-1 text-xs text-muted-foreground">They need to have signed in at least once before you can invite them.</p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium">Assignments</h4>
        <ul className="flex flex-col gap-1 text-sm">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between" data-testid={`assignment-row-${a.id}`}>
              <span>
                {a.judgeName} → {a.teamName} ({a.status})
              </span>
              <RemoveAssignmentButton assignmentId={a.id} />
            </li>
          ))}
          {assignments.length === 0 ? <p className="text-muted-foreground">No assignments yet.</p> : null}
        </ul>
        <form action={assignAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="assign-judge">Judge</Label>
            <select id="assign-judge" name="judgeId" required className={selectClass} data-testid="assign-judge-select">
              <option value="">Choose…</option>
              {judges.map((j) => (
                <option key={j.userId} value={j.userId}>
                  {j.fullName ?? j.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="assign-team">Team</Label>
            <select id="assign-team" name="teamId" required className={selectClass} data-testid="assign-team-select">
              <option value="">Choose…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.submitted ? "" : " (not submitted)"}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={assignPending} data-testid="assign-submit">
            {assignPending ? "Assigning…" : "Assign"}
          </Button>
        </form>
        <FormStatus state={assignState} />
      </div>
    </div>
  );
}

function RemoveAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(removeAssignment, null);
  return (
    <form action={action}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "…" : "Remove"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function CalibrationSection({
  eventId,
  criteria,
  samples,
}: {
  eventId: string;
  criteria: CriterionRow[];
  samples: CalibrationSampleRow[];
}) {
  const [createState, createAction, createPending] = useActionState<ActionResult | null, FormData>(createCalibrationSample, null);
  const [values, setValues] = useState<Record<string, number>>({});

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {samples.map((s) => (
          <li key={s.id} className="flex items-center justify-between glass p-3 text-sm" data-testid={`sample-${s.id}`}>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </div>
            <DeleteSampleButton eventId={eventId} id={s.id} />
          </li>
        ))}
        {samples.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calibration samples yet — judges can&apos;t clear the calibration gate until at least one exists.
          </p>
        ) : null}
      </ul>
      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add rubric criteria first.</p>
      ) : (
        <form action={createAction} className="flex flex-col gap-2 glass p-3">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="referenceScores" value={JSON.stringify(values)} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-title">Title</Label>
            <Input id="s-title" name="title" required maxLength={120} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-desc">Description shown to the judge</Label>
            <Textarea id="s-desc" name="description" required maxLength={2000} rows={3} />
          </div>
          <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">Reference scores</p>
          {criteria.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <Label htmlFor={`ref-${c.id}`}>{c.label}</Label>
              <Input
                id={`ref-${c.id}`}
                type="number"
                min={0}
                max={c.scaleMax}
                className="w-24"
                value={values[c.id] ?? ""}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  setValues((prev) => ({
                    ...prev,
                    [c.id]: isValueInRange(raw, c.scaleMax) ? clampScoreValue(raw, c.scaleMax) : 0,
                  }));
                }}
              />
            </div>
          ))}
          <Button type="submit" disabled={createPending} data-testid="add-sample">
            {createPending ? "Adding…" : "Add calibration sample"}
          </Button>
          <FormStatus state={createState} />
        </form>
      )}
    </div>
  );
}

function DeleteSampleButton({ eventId, id }: { eventId: string; id: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteCalibrationSample, null);
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Remove"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
