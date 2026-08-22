import { formatWhen } from "@/lib/datetime";
import { Panel } from "@/components/ui/panel";
import type { ScheduleItem } from "@/lib/comms/queries";

export function ScheduleList({ items }: { items: ScheduleItem[] }) {
  if (items.length === 0) {
    return <Panel className="text-sm text-muted-foreground">No sessions on the schedule yet.</Panel>;
  }
  return (
    <Panel className="p-0">
      <ol className="flex flex-col">
        {items.map((item, i) => (
          <li key={item.id} className="relative flex gap-4 p-4" data-testid={`schedule-${item.id}`}>
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-primary bg-primary/30" />
              {i < items.length - 1 ? <span className="mt-1 w-px flex-1 bg-panel-border" /> : null}
            </div>
            <div className="flex-1 pb-1">
              <p className="font-mono text-xs uppercase tracking-eyebrow text-primary">{item.kind}</p>
              <p className="font-medium">{item.title}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatWhen(item.startsAt)}
                {item.endsAt ? ` – ${formatWhen(item.endsAt)}` : ""}
                {item.location ? ` · ${item.location}` : ""}
              </p>
              {item.description ? <p className="mt-2 text-sm">{item.description}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
