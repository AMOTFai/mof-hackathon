"use client";

import { useActionState } from "react";
import {
  createTeam,
  joinTeam,
  leaveTeam,
  removeMember,
  setMemberRole,
  updateTeam,
  type ActionResult,
} from "@/app/(participant)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { Avatar } from "@/components/ui/avatar";
import { CopyInviteCode } from "@/components/participant/copy-invite-code";
import { FormStatus } from "@/components/participant/profile-form";
import { ProxySetup } from "@/components/participant/proxy-setup";
import type { ParticipantEvent, TeamMembership } from "@/lib/teams/queries";

export function CreateJoinTeam({ event }: { event: ParticipantEvent }) {
  const [createState, createAction, createPending] = useActionState<ActionResult | null, FormData>(
    createTeam,
    null,
  );
  const [joinState, joinAction, joinPending] = useActionState<ActionResult | null, FormData>(joinTeam, null);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel variant="glow" className="flex flex-col gap-3">
        <div>
          <p className="text-xs uppercase tracking-eyebrow text-primary">Start fresh</p>
          <h3 className="font-display font-medium">Create a team</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You become captain. Max {event.maxTeamSize} members on this event.
          </p>
        </div>
        <form action={createAction} className="flex flex-col gap-3">
          <input type="hidden" name="eventId" value={event.eventId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${event.eventId}`}>Team name</Label>
            <Input id={`name-${event.eventId}`} name="name" required minLength={2} maxLength={80} />
          </div>
          <Button type="submit" variant="mission" disabled={createPending} data-testid={`create-team-${event.eventSlug}`}>
            {createPending ? "Creating…" : "Create team"}
          </Button>
          <FormStatus state={createState} />
        </form>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <div>
          <p className="text-xs uppercase tracking-eyebrow text-muted-foreground">Already have a code</p>
          <h3 className="font-display font-medium">Join with invite code</h3>
          <p className="mt-1 text-sm text-muted-foreground">Ask your captain for their team&apos;s code.</p>
        </div>
        <form action={joinAction} className="flex flex-col gap-3">
          <input type="hidden" name="eventId" value={event.eventId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`code-${event.eventId}`}>Invite code</Label>
            <Input
              id={`code-${event.eventId}`}
              name="inviteCode"
              required
              minLength={4}
              maxLength={16}
              className="font-mono uppercase tracking-eyebrow"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="e.g. 4f2a9c1e"
              data-testid={`invite-code-${event.eventSlug}`}
            />
          </div>
          <Button type="submit" variant="outline" disabled={joinPending} data-testid={`join-team-${event.eventSlug}`}>
            {joinPending ? "Joining…" : "Join team"}
          </Button>
          <FormStatus state={joinState} />
        </form>
      </Panel>
    </div>
  );
}

export function TeamManage({
  membership,
  currentUserId,
  appUrl,
}: {
  membership: TeamMembership;
  currentUserId: string;
  appUrl: string;
}) {
  const isCaptain = membership.myRole === "captain";
  const captainCount = membership.members.filter((row) => row.role === "captain").length;
  const [updateState, updateAction, updatePending] = useActionState<ActionResult | null, FormData>(
    updateTeam,
    null,
  );
  const [leaveState, leaveAction, leavePending] = useActionState<ActionResult | null, FormData>(leaveTeam, null);

  return (
    <div className="flex flex-col gap-6">
      <Panel variant="glow" className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-eyebrow text-muted-foreground">Invite code</p>
        <CopyInviteCode code={membership.inviteCode} />
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {membership.members.length}/{membership.maxTeamSize} members · you are {membership.myRole}
        </p>
      </Panel>

      {isCaptain ? (
        <Panel>
          <form action={updateAction} className="flex flex-col gap-3">
            <h3 className="font-display font-medium">Team details</h3>
            <input type="hidden" name="teamId" value={membership.teamId} />
            {/* Preserved so saving here does not clear what was entered on /dashboard/submit. */}
            <input type="hidden" name="repo_url" value={membership.repoUrl ?? ""} />
            <input type="hidden" name="video_url" value={membership.videoUrl ?? ""} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-name">Name</Label>
              <Input id="team-name" name="name" defaultValue={membership.name} required maxLength={80} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input id="project-name" name="project_name" defaultValue={membership.projectName ?? ""} maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={membership.description ?? ""} maxLength={1000} />
            </div>
            <Button type="submit" variant="mission" disabled={updatePending || Boolean(membership.submittedAt)}>
              {updatePending ? "Saving…" : "Save team"}
            </Button>
            {membership.submittedAt ? (
              <p className="text-sm text-muted-foreground">Submitted teams cannot be edited.</p>
            ) : null}
            <FormStatus state={updateState} />
          </form>
        </Panel>
      ) : (
        <Panel>
          <h3 className="font-display font-medium">{membership.name}</h3>
          {membership.projectName ? <p className="text-sm">{membership.projectName}</p> : null}
          {membership.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{membership.description}</p>
          ) : null}
        </Panel>
      )}

      <Panel>
        <h3 className="mb-3 font-display font-medium">Members</h3>
        <ul className="flex flex-col gap-3">
          {membership.members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border pb-3 last:border-0 last:pb-0"
                data-testid={`member-${member.userId}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar id={member.userId} name={member.fullName} />
                  <div>
                    <p className="text-sm font-medium">
                      {member.fullName || member.email}
                      {isSelf ? " (you)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.role}
                      {member.githubUsername ? ` · @${member.githubUsername}` : ""}
                    </p>
                  </div>
                </div>
                {isCaptain ? (
                  <div className="flex flex-wrap gap-2">
                    {member.role === "member" ? (
                      <RoleButton teamId={membership.teamId} userId={member.userId} role="captain" label="Make captain" />
                    ) : (
                      <RoleButton
                        teamId={membership.teamId}
                        userId={member.userId}
                        role="member"
                        label="Make member"
                        disabled={captainCount === 1}
                      />
                    )}
                    {!isSelf ? (
                      <RemoveButton teamId={membership.teamId} userId={member.userId} />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <ProxySetup teamId={membership.teamId} proxyToken={membership.proxyToken} appUrl={appUrl} isCaptain={isCaptain} />
      </Panel>

      <form action={leaveAction} className="flex flex-col gap-2">
        <input type="hidden" name="teamId" value={membership.teamId} />
        <Button type="submit" variant="outline" disabled={leavePending} data-testid="leave-team">
          {leavePending ? "Leaving…" : "Leave team"}
        </Button>
        <FormStatus state={leaveState} />
      </form>
    </div>
  );
}

function RoleButton({
  teamId,
  userId,
  role,
  label,
  disabled,
}: {
  teamId: string;
  userId: string;
  role: "captain" | "member";
  label: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setMemberRole, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || disabled}>
        {pending ? "…" : label}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

function RemoveButton({ teamId, userId }: { teamId: string; userId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(removeMember, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending} data-testid={`remove-${userId}`}>
        {pending ? "…" : "Remove"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
