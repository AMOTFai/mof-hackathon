import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { relTime } from "@/lib/format";
import { ANNOUNCEMENTS, isStaff } from "@/lib/enums";
import MessageComposer from "@/components/MessageComposer";

export default async function MessagesPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const view = searchParams.c === "team" && user.teamId ? "team" : "announcements";
  const channel = view === "team" ? user.teamId! : ANNOUNCEMENTS;

  const messages = await prisma.message.findMany({ where: { channel }, orderBy: { createdAt: "asc" }, include: { sender: true } });
  const canPost = view === "announcements" ? staff : true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <div className="ml-auto flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-sm">
          <Link href="/messages" className={`rounded-lg px-3 py-1 ${view === "announcements" ? "bg-white/10" : "text-slate-400 hover:text-slate-200"}`}>Announcements</Link>
          {user.teamId && <Link href="/messages?c=team" className={`rounded-lg px-3 py-1 ${view === "team" ? "bg-white/10" : "text-slate-400 hover:text-slate-200"}`}>Team channel</Link>}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {view === "announcements" ? `Broadcast from organizers to everyone. ${staff ? "You can post here." : "Read-only for participants."}` : "Private to your team members."}
      </p>

      <div className="glass min-h-[320px] space-y-4 p-6">
        {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{m.sender.name}</span>
              {isStaff(m.sender.role) && <span className="chip capitalize">{m.sender.role}</span>}
              <span className="text-xs text-slate-500">{relTime(m.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-slate-200">{m.text}</p>
          </div>
        ))}
      </div>

      {canPost ? (
        <MessageComposer channel={channel} placeholder={view === "announcements" ? "Broadcast to all participants…" : "Message your team…"} />
      ) : (
        <p className="text-xs text-slate-500">Only organizers can post announcements.</p>
      )}
    </div>
  );
}
