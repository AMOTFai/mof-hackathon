"use client";

import { useTransition } from "react";
import { setBracket } from "@/app/actions";
import { BRACKETS } from "@/lib/enums";

const cls: Record<string, string> = {
  cup: "border-cup/50 bg-cup/10 text-cup",
  plate: "border-plate/50 bg-plate/10 text-plate",
  unassigned: "text-slate-400",
};

export default function BracketToggle({ teamId, current, capped = false }: { teamId: string; current: string; capped?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">Bracket</span>
      <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        {BRACKETS.map((b) => {
          // A capped team is locked to Plate — Cup is disabled.
          const locked = capped && b === "cup";
          return (
            <button
              key={b}
              disabled={pending || locked}
              title={locked ? "Plate-capped — missed the Wed V1 slice" : undefined}
              onClick={() =>
                start(() => {
                  const fd = new FormData();
                  fd.set("teamId", teamId);
                  fd.set("bracket", b);
                  setBracket(fd);
                })
              }
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${current === b ? `border ${cls[b]}` : "text-slate-400 hover:text-slate-200"} ${locked ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {b}
            </button>
          );
        })}
      </div>
    </div>
  );
}
