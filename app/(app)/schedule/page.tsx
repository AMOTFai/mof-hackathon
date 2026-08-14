import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtTime } from "@/lib/format";
import { isStaff } from "@/lib/enums";
import { addScheduleItem, deleteScheduleItem } from "@/app/actions";
import { SectionTitle } from "@/components/ui";

export default async function SchedulePage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const items = await prisma.scheduleItem.findMany({ orderBy: { startsAt: "asc" } });

  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.startsAt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }

  return (
    <div className="space-y-8">
      <SectionTitle eyebrow="Programme" title="Schedule" />
      <div className="space-y-6">
        {[...groups.entries()].map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-medium text-slate-400">{day}</h2>
            <ul className="overflow-hidden rounded-2xl border border-white/10">
              {dayItems.map((it) => (
                <li key={it.id} className="flex items-start gap-4 border-b border-white/8 bg-white/[0.02] px-4 py-3 last:border-0">
                  <span className="w-16 shrink-0 font-mono text-sm text-teal-200">{fmtTime(it.startsAt)}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{it.title}</p>
                    <p className="text-xs text-slate-500">{it.location || ""}{it.description ? ` · ${it.description}` : ""}</p>
                  </div>
                  {staff && (
                    <form action={deleteScheduleItem}><input type="hidden" name="id" value={it.id} /><button className="text-xs text-slate-600 hover:text-rose-300">delete</button></form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">No schedule items yet.</p>}
      </div>

      {staff && (
        <section className="glass-strong p-6">
          <h2 className="mb-4 text-sm font-medium">Add item</h2>
          <form action={addScheduleItem} className="grid gap-3 sm:grid-cols-2">
            <input name="title" required placeholder="Title" className="input" />
            <input name="startsAt" type="datetime-local" required className="input" />
            <input name="location" placeholder="Location" className="input" />
            <input name="description" placeholder="Description" className="input" />
            <button className="btn-primary sm:col-span-2">Add to schedule</button>
          </form>
        </section>
      )}
    </div>
  );
}
