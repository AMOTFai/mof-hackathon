"use client";

import { useTransition } from "react";
import { toggleConflict } from "@/app/actions";

export default function ConflictToggle({ teamId, active }: { teamId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => toggleConflict(fd))}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="teamId" value={teamId} />
      {!active && <input name="reason" placeholder="Conflict reason (optional)" className="input hidden w-56 sm:block" />}
      <button
        className={`btn px-3 py-1.5 text-xs ${active ? "border border-rose-400/50 bg-rose-400/10 text-rose-200" : "btn-ghost"}`}
        disabled={pending}
      >
        {active ? "Conflict declared — clear" : "Declare conflict"}
      </button>
    </form>
  );
}
