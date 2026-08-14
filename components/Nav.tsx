import Link from "next/link";
import { signOut } from "@/app/actions";
import { isStaff } from "@/lib/enums";

export default function Nav({ user }: { user: { name: string; role: string } }) {
  const staff = isStaff(user.role);
  const links: [string, string][] = [
    ["/", "Overview"],
    ["/team", "My Team"],
    ["/schedule", "Schedule"],
    ["/messages", "Messages"],
  ];
  if (staff) links.push(["/judge", "Judging"]);
  if (user.role === "organizer") links.push(["/organizer", "Organizer"]);
  links.push(["/profile", "Profile"]);

  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#06070f]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-7">
          <Link href="/" className="group flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-400 to-teal-300 shadow-[0_0_16px_rgba(139,123,255,0.6)]" />
            <span className="glow-text">Minds<span className="text-teal-300">·</span>Future</span>
          </Link>
          <nav className="hidden gap-1 text-sm md:flex">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden items-center gap-2 text-slate-300 sm:flex">
            {user.name}
            <span className="chip capitalize">{user.role}</span>
          </span>
          <form action={signOut}>
            <button className="btn-ghost px-3 py-1.5 text-xs">Sign out</button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 text-sm md:hidden">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-slate-400 hover:text-slate-100">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
