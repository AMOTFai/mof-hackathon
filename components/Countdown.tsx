"use client";

import { useEffect, useState } from "react";

// Live-ticking countdown to a deadline. Renders on the client to avoid
// server/client hydration drift.
export default function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(to).getTime() - now;
  const past = diff <= 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const parts = d > 0 ? [`${d}d`, `${h}h`, `${m}m`] : [`${h}h`, `${m}m`, `${s}s`];

  return (
    <span className={`font-mono tabular-nums ${past ? "text-rose-300" : diff < 3_600_000 ? "text-amber-300" : "text-teal-200"}`}>
      {past ? "overdue " : ""}
      {parts.join(" ")}
    </span>
  );
}
