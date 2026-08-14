"use client";

import { useTransition } from "react";
import { toggleAssignment } from "@/app/actions";

export default function AssignmentToggle({ judgeId, bracket, active }: { judgeId: string; bracket: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(() => {
          const fd = new FormData();
          fd.set("judgeId", judgeId);
          fd.set("bracket", bracket);
          toggleAssignment(fd);
        })
      }
      className={`rounded-lg border px-3 py-1 text-xs capitalize transition-colors ${
        active
          ? bracket === "cup"
            ? "border-cup/50 bg-cup/10 text-cup"
            : "border-plate/50 bg-plate/10 text-plate"
          : "border-white/10 bg-black/20 text-slate-500 hover:text-slate-300"
      }`}
    >
      {active ? `✓ ${bracket}` : bracket}
    </button>
  );
}
