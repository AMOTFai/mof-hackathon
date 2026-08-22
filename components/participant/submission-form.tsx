"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { submitTeam, updateTeam, type ActionResult } from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import type { TeamMembership } from "@/lib/teams/queries";
import { missingSubmissionFields } from "@/lib/submission/readiness";
import { isHttpUrl } from "@/lib/url";

function Countdown({ deadline }: { deadline: string }) {
  const target = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const [now, setNow] = useState<number | null>(null);

  // Start ticking only after mount so server and client render the same markup.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return <p className="text-sm text-muted-foreground">Deadline {formatWhen(deadline)}</p>;
  }

  const remaining = target - now;
  if (remaining <= 0) {
    return (
      <p className="text-sm font-medium text-destructive" data-testid="deadline-passed">
        The submission deadline has passed ({formatWhen(deadline)}).
      </p>
    );
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const urgent = remaining < 3_600_000;

  return (
    <p
      className={`text-sm ${urgent ? "font-medium text-warning" : "text-muted-foreground"}`}
      data-testid="deadline-countdown"
    >
      {hours}h {minutes}m {seconds}s left · deadline {formatWhen(deadline)}
    </p>
  );
}

export function SubmissionForm({ membership }: { membership: TeamMembership }) {
  const isCaptain = membership.myRole === "captain";
  const submitted = Boolean(membership.submittedAt);
  const missing = missingSubmissionFields(membership);

  const [saveState, saveAction, savePending] = useActionState<ActionResult | null, FormData>(updateTeam, null);
  const [submitState, submitAction, submitPending] = useActionState<ActionResult | null, FormData>(submitTeam, null);

  // One key per mounted form: a double-click or retry of the SAME attempt
  // replays idempotently instead of erroring with "already submitted".
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  if (submitted) {
    return (
      <div className="flex flex-col gap-3 glass border-success/40 bg-success/[0.04] p-4" data-testid="submission-locked">
        <span className="chip w-fit border-success/50 text-success">Submitted</span>
        <h3 className="font-display font-medium">Locked in</h3>
        <p className="text-sm text-muted-foreground">
          Locked at {formatWhen(membership.submittedAt!)}. Submissions are final — talk to an organizer if something is
          wrong.
        </p>
        <dl className="flex flex-col gap-1 text-sm">
          <div>
            <dt className="inline text-muted-foreground">Project: </dt>
            <dd className="inline">{membership.projectName}</dd>
          </div>
          {isHttpUrl(membership.repoUrl) ? (
            <div>
              <dt className="inline text-muted-foreground">Repo: </dt>
              <dd className="inline">
                <a href={membership.repoUrl} target="_blank" rel="noreferrer" className="underline">
                  {membership.repoUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {isHttpUrl(membership.videoUrl) ? (
            <div>
              <dt className="inline text-muted-foreground">Video: </dt>
              <dd className="inline">
                <a href={membership.videoUrl} target="_blank" rel="noreferrer" className="underline">
                  {membership.videoUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Countdown deadline={membership.submissionDeadline} />

      {!isCaptain ? (
        <p className="glass p-4 text-sm text-muted-foreground" data-testid="not-captain">
          Only the captain can edit and submit. Ask them to finish the submission.
        </p>
      ) : (
        <>
          <form action={saveAction} className="flex flex-col gap-3 glass p-4">
            <h3 className="font-display font-medium">Submission details</h3>
            <p className="text-sm text-muted-foreground">Save as you go. Submitting is a separate, final step.</p>
            <input type="hidden" name="teamId" value={membership.teamId} />
            <input type="hidden" name="name" value={membership.name} />
            <input type="hidden" name="description" value={membership.description ?? ""} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-project">Project name</Label>
              <Input
                id="sub-project"
                name="project_name"
                defaultValue={membership.projectName ?? ""}
                maxLength={120}
                data-testid="sub-project"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-repo">Repo URL</Label>
              <Input
                id="sub-repo"
                name="repo_url"
                type="url"
                placeholder="https://github.com/..."
                defaultValue={membership.repoUrl ?? ""}
                maxLength={2048}
                data-testid="sub-repo"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-video">Demo video URL</Label>
              <Input
                id="sub-video"
                name="video_url"
                type="url"
                placeholder="https://youtube.com/..."
                defaultValue={membership.videoUrl ?? ""}
                maxLength={2048}
                data-testid="sub-video"
              />
            </div>
            <Button type="submit" variant="outline" disabled={savePending} data-testid="sub-save">
              {savePending ? "Saving…" : "Save draft"}
            </Button>
            <FormStatus state={saveState} />
          </form>

          <form action={submitAction} className="flex flex-col gap-3 glass p-4">
            <h3 className="font-display font-medium">Submit final</h3>
            {missing.length > 0 ? (
              <p className="text-sm text-warning" data-testid="sub-missing">
                Still needed: {missing.join(", ")}. Save the draft above first.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This locks your submission and your team&apos;s check-ins. It cannot be undone.
              </p>
            )}
            <input type="hidden" name="teamId" value={membership.teamId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <Button type="submit" variant="mission" disabled={submitPending || missing.length > 0} data-testid="sub-submit">
              {submitPending ? "Submitting…" : "Submit final"}
            </Button>
            <FormStatus state={submitState} />
          </form>
        </>
      )}
    </div>
  );
}
