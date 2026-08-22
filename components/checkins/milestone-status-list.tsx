import { formatWhen } from "@/lib/datetime";
import { STATUS_META, type MilestoneWithStatus } from "@/lib/checkins/status";

export function MilestoneStatusList({ milestones }: { milestones: MilestoneWithStatus[] }) {
  if (milestones.length === 0) {
    return <p className="text-sm text-muted-foreground">No milestones on this event yet.</p>;
  }
  const capped = milestones.some((m) => m.penalty === "plate_cap" && (m.status === "missed" || m.status === "late"));
  return (
    <div className="flex flex-col gap-3">
      {capped ? (
        <p
          className="glass border-warning/50 bg-warning/10 p-3 text-sm text-warning"
          data-testid="plate-cap-notice"
        >
          A required milestone was missed or late — this caps the team&apos;s bracket to Plate.
        </p>
      ) : null}
      <ol className="flex flex-col gap-2">
        {milestones.map((m) => {
          const meta = STATUS_META[m.status];
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 glass p-3"
              data-testid={`milestone-${m.key}`}
            >
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">Due {formatWhen(m.dueAt)}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${meta.tone}`}>{meta.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
