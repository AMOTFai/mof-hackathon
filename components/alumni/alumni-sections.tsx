"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPost, deletePost, respondToIntro, sendIntroRequest } from "@/app/(alumni)/alumni/actions";
import type { ActionResult } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/ui/form-status";
import { formatWhen } from "@/lib/datetime";
import { ALUMNI_POST_KINDS } from "@/lib/validation/alumni";
import type { AlumniPostRow, IntroRequestRow } from "@/lib/alumni/queries";
import type { TalentSearchRow } from "@/lib/talent/queries";

export function DirectoryList({ candidates }: { candidates: TalentSearchRow[] }) {
  if (candidates.length === 0) return <p className="text-sm text-muted-foreground">No consented alumni profiles yet.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="alumni-directory">
      {candidates.map((c) => (
        <li key={c.userId} className="flex items-center justify-between glass p-3" data-testid={`alumni-${c.userId}`}>
          <div>
            <p className="text-sm font-medium">{c.headline ?? "Alum"}</p>
            {c.openTo.length > 0 ? <p className="text-xs text-muted-foreground">Open to: {c.openTo.join(", ")}</p> : null}
          </div>
          <Link href={`/alumni?view=${c.userId}`} className="chip transition-colors hover:text-primary" data-testid={`view-alum-${c.userId}`}>
            View
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PostsBoard({ posts, currentUserId }: { posts: AlumniPostRow[]; currentUserId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createPost, null);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {posts.map((p) => (
          <li key={p.id} className="glass p-3" data-testid={`post-${p.id}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-eyebrow text-muted-foreground">
                {p.kind} · {p.authorName ?? "Alum"} · {formatWhen(p.createdAt)}
              </p>
              {p.authorId === currentUserId ? <DeletePostButton id={p.id} /> : null}
            </div>
            <p className="mt-1 text-sm font-medium">{p.title}</p>
            <p className="text-sm">{p.body}</p>
            {p.tags && p.tags.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{p.tags.join(", ")}</p> : null}
          </li>
        ))}
        {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet.</p> : null}
      </ul>
      <form action={action} className="flex flex-col gap-2 glass p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="post-kind">Kind</Label>
          <select id="post-kind" name="kind" defaultValue="update" className="h-9 rounded-md border border-input bg-panel px-2 text-sm">
            {ALUMNI_POST_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="post-title">Title</Label>
          <Input id="post-title" name="title" required maxLength={200} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="post-body">Body</Label>
          <Textarea id="post-body" name="body" required maxLength={4000} rows={3} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="post-tags">Tags (comma-separated)</Label>
          <Input id="post-tags" name="tags" maxLength={300} />
        </div>
        <Button type="submit" variant="mission" disabled={pending} data-testid="create-post">
          {pending ? "Posting…" : "Post"}
        </Button>
        <FormStatus state={state} />
      </form>
    </div>
  );
}

function DeletePostButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deletePost, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} data-testid={`delete-post-${id}`}>
        {pending ? "…" : "Delete"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function IntroRequestForm({ targetId }: { targetId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(sendIntroRequest, null);
  return (
    <form action={action} className="flex flex-col gap-2 glass p-3">
      <input type="hidden" name="targetId" value={targetId} />
      <Label htmlFor="intro-context">Request an intro</Label>
      <Textarea id="intro-context" name="context" required maxLength={1000} rows={2} placeholder="Why do you want to connect?" />
      <Button type="submit" variant="mission" disabled={pending} data-testid="send-intro">
        {pending ? "Sending…" : "Send request"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function IntroRequestsList({ requests, currentUserId }: { requests: IntroRequestRow[]; currentUserId: string }) {
  if (requests.length === 0) return <p className="text-sm text-muted-foreground">No intro requests yet.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="intro-requests">
      {requests.map((r) => {
        const isTarget = r.targetId === currentUserId;
        // Profiles RLS has no policy for reading a stranger's row, so the
        // counterparty's name can come back null here even though this is a
        // legitimate context (an active intro request between the two of
        // them) — fall back to a generic label rather than a bare UUID.
        const counterpartyName = (isTarget ? r.requesterName : r.targetName) ?? "another alum";
        return (
          <li key={r.id} className="glass p-3 text-sm" data-testid={`intro-${r.id}`}>
            <p>
              {isTarget ? "From" : "To"} {counterpartyName} — {r.status} — {formatWhen(r.createdAt)}
            </p>
            <p className="text-muted-foreground">{r.context}</p>
            {isTarget && r.status === "pending" ? <RespondButtons id={r.id} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function RespondButtons({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(respondToIntro, null);
  return (
    <form action={action} className="mt-2 flex gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" name="status" value="accepted" size="sm" disabled={pending} data-testid={`accept-${id}`}>
        Accept
      </Button>
      <Button type="submit" name="status" value="declined" size="sm" variant="outline" disabled={pending} data-testid={`decline-${id}`}>
        Decline
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
