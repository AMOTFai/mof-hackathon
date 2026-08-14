"use client";

import { useRef, useState, useTransition } from "react";
import { createCheckIn } from "@/app/actions";

// Optimized for <30s: the "what we built" box is always focused and submits on
// its own. "Stuck on" and a link are optional and tucked behind a toggle.
export default function CheckInForm() {
  const [pending, start] = useTransition();
  const [showMore, setShowMore] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          await createCheckIn(fd);
          formRef.current?.reset();
          setShowMore(false);
        })
      }
      className="space-y-3"
    >
      <div>
        <label className="label" htmlFor="text">What did your team build or figure out?</label>
        <textarea
          id="text"
          name="text"
          required
          rows={2}
          autoFocus
          placeholder="e.g. Got auth + deck ingestion working; switched to FSRS for scheduling."
          className="input resize-none"
        />
      </div>

      {showMore && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="stuckOn">Stuck on anything? (optional)</label>
            <input id="stuckOn" name="stuckOn" className="input" placeholder="What's blocking you right now" />
          </div>
          <div>
            <label className="label" htmlFor="link">Link / screenshot (optional)</label>
            <input id="link" name="link" type="url" className="input" placeholder="https://" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Posting…" : "Post check-in"}
        </button>
        {!showMore && (
          <button type="button" onClick={() => setShowMore(true)} className="text-xs text-muted hover:text-slate-200">
            + add blocker / link
          </button>
        )}
      </div>
    </form>
  );
}
