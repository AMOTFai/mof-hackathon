import { requireUser } from "@/lib/session";
import { updateProfile } from "@/app/actions";
import { publicBaseUrl } from "@/lib/proxy";
import ProxySetup from "@/components/ProxySetup";

export default async function ProfilePage() {
  const user = await requireUser();
  const team = user.team;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="eyebrow mb-1">Account</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-slate-400">{user.email} · <span className="chip capitalize">{user.role}</span>{user.expertise ? <span className="chip ml-1 capitalize">{user.expertise}</span> : null}</p>
      </div>
      <form action={updateProfile} className="glass-strong space-y-4 p-6">
        <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" defaultValue={user.name} required className="input" /></div>
        <div><label className="label" htmlFor="university">University</label><input id="university" name="university" defaultValue={user.university || ""} className="input" /></div>
        <div>
          <label className="label" htmlFor="skills">Skills / tags</label>
          <input id="skills" name="skills" defaultValue={user.skills || ""} placeholder="React, ML, design" className="input" />
          <p className="mt-1 text-xs text-slate-500">Comma-separated.</p>
        </div>
        <div><label className="label" htmlFor="bio">Short bio</label><textarea id="bio" name="bio" defaultValue={user.bio || ""} rows={3} className="input resize-none" /></div>
        <button className="btn-primary">Save profile</button>
      </form>

      {team?.proxyToken ? (
        <ProxySetup teamName={team.name} token={team.proxyToken} baseUrl={publicBaseUrl()} logContent={team.logApiContent} />
      ) : user.role === "participant" ? (
        <section className="glass p-6 text-sm text-slate-400">
          Join or create a team to get your API proxy endpoint for logging AI activity.
        </section>
      ) : null}
    </div>
  );
}
