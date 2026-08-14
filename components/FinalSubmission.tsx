"use client";

import { useState } from "react";
import { submitFinal } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";

type TeamLite = {
  projectName: string | null;
  description: string | null;
  repoUrl: string | null;
  videoUrl: string | null;
  submittedAt: string | null;
};

// YC-style final submission. Locks check-ins once submitted, so it double-confirms.
export default function FinalSubmission({ team }: { team: TeamLite }) {
  const [confirming, setConfirming] = useState(false);

  if (team.submittedAt) {
    return (
      <div className="card border-cup/40">
        <h2 className="mb-1 text-sm font-medium text-cup">Submitted ✓</h2>
        <p className="text-xs text-muted">Locked {fmtDateTime(team.submittedAt)}. Contact an organizer to reopen.</p>
        {team.videoUrl && (
          <a href={team.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-plate underline">
            View submitted video ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-medium">Final submission</h2>
      <form action={submitFinal} className="space-y-3">
        <input name="projectName" defaultValue={team.projectName || ""} placeholder="Project name" required className="input" />
        <textarea name="description" defaultValue={team.description || ""} placeholder="What you built (2-3 sentences)" rows={3} required className="input resize-none" />
        <input name="repoUrl" defaultValue={team.repoUrl || ""} type="url" placeholder="GitHub repo URL" required className="input" />
        <input name="videoUrl" type="url" placeholder="2-min video (YouTube / Loom / upload URL)" required className="input" />

        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="btn-primary w-full">
            Submit final project
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-cup/40 bg-cup/5 p-3">
            <p className="text-xs text-cup">This locks all further check-ins. Sure?</p>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">Yes, submit &amp; lock</button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
