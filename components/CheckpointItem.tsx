"use client";

import { useState, useTransition } from "react";
import { submitCheckpoint } from "@/app/actions";
import { StatusPill } from "@/components/ui";
import type { CheckpointStatus } from "@/lib/checkpoints";
import { fmtDateTime } from "@/lib/format";
import Countdown from "@/components/Countdown";

type Def = { id: string; label: string; requirement: string; dueAt: string; requiresText: boolean; autoPlateCap: boolean };

export default function CheckpointItem({
  def,
  status,
  content,
  submittedAt,
}: {
  def: Def;
  status: CheckpointStatus;
  content: string | null;
  submittedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const done = status === "hit" || status === "late";

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{def.label}</p>
            {def.autoPlateCap && <span className="chip border-rose-400/30 text-rose-300">Plate-cap gate</span>}
          </div>
          <p className="mt-0.5 text-sm text-slate-400">{def.requirement}</p>
          <p className="mt-1 text-xs text-slate-500">
            Due {fmtDateTime(def.dueAt)}
            {!done && <> · <Countdown to={def.dueAt} /></>}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      {content && (
        <p className="mt-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-300">{content}</p>
      )}

      <div className="mt-3">
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-xs text-teal-300 hover:underline">
            {done ? "Update submission" : "Submit this checkpoint"}
          </button>
        ) : (
          <form
            action={(fd) => start(async () => { await submitCheckpoint(fd); setOpen(false); })}
            className="space-y-2"
          >
            <input type="hidden" name="checkpointId" value={def.id} />
            <textarea
              name="content"
              defaultValue={content ?? ""}
              required={def.requiresText}
              rows={2}
              autoFocus
              placeholder={def.requiresText ? "A line or two…" : "Optional note"}
              className="input resize-none"
            />
            <div className="flex gap-2">
              <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>{pending ? "Saving…" : "Submit"}</button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
