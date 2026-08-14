import { STATUS_META, type CheckpointStatus } from "@/lib/checkpoints";

export function StatusPill({ status }: { status: CheckpointStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.tone}`}>{m.label}</span>;
}

export function BracketChip({ bracket }: { bracket: string }) {
  const map: Record<string, string> = {
    cup: "border-cup/40 bg-cup/10 text-cup",
    plate: "border-plate/40 bg-plate/10 text-plate",
    unassigned: "border-white/12 bg-white/5 text-slate-400",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${map[bracket] ?? map.unassigned}`}>{bracket}</span>;
}

// Circular score gauge, out of 100.
export function ScoreRing({ value, size = 68 }: { value: number | null; size?: number }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#g)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b7bff" />
            <stop offset="100%" stopColor="#43e0c6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-base font-semibold leading-none">{value === null ? "—" : value.toFixed(0)}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500">/100</span>
      </div>
    </div>
  );
}

// Segmented progress dots (e.g. checkpoints hit).
export function Progress({ total, hit, late = 0 }: { total: number; hit: number; late?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const tone = i < hit ? "bg-emerald-400" : i < hit + late ? "bg-amber-400" : "bg-white/12";
        return <span key={i} className={`h-1.5 w-5 rounded-full ${tone}`} />;
      })}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}
