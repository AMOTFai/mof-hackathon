"use client";

import { useTransition } from "react";
import { saveNote } from "@/app/actions";

export default function NotePad({ teamId, initial }: { teamId: string; initial: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass p-5">
      <h2 className="mb-1 text-sm font-medium">Private notes</h2>
      <p className="mb-3 text-xs text-slate-500">Only you can see these.</p>
      <form action={(fd) => start(() => saveNote(fd))} className="space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <textarea name="text" defaultValue={initial} rows={4} placeholder="Your notes for the panel…" className="input resize-none" />
        <button className="btn-ghost w-full" disabled={pending}>{pending ? "Saving…" : "Save notes"}</button>
      </form>
    </div>
  );
}
