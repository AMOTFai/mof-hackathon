import { PROVIDERS } from "@/lib/providers";
import { setApiContentLogging, regenProxyToken } from "@/app/actions";
import CopyField from "./CopyField";

// Participant-facing setup for the API proxy. Framed as another form of process
// logging (same spirit as check-ins and commits) — visibility, not enforcement.
export default function ProxySetup({
  teamName,
  token,
  baseUrl,
  logContent,
}: {
  teamName: string;
  token: string;
  baseUrl: string;
  logContent: boolean;
}) {
  return (
    <section className="glass-strong space-y-5 p-6">
      <div>
        <p className="eyebrow mb-1 text-teal-300">Process logging</p>
        <h2 className="text-lg font-medium">API activity — {teamName}</h2>
        <p className="mt-1 text-sm text-slate-400">
          Route your AI SDK through our proxy and your calls show up on the judge log next to your
          commits and check-ins. Same spirit as the 6pm check-in: it lets judges see <em>how</em> you
          worked. You keep using your own API key — we just forward the call. Nothing is blocked, and
          you can point the SDK straight at the provider any time.
        </p>
      </div>

      <div>
        <p className="label mb-1">Your team token</p>
        <div className="flex items-center gap-2">
          <CopyField value={token} />
          <form action={regenProxyToken}>
            <button className="btn-ghost shrink-0 px-3 py-2 text-xs">Rotate</button>
          </form>
        </div>
        <p className="mt-1 text-xs text-slate-500">Sent as an <code>x-motf-team</code> header (or <code>?team=</code>). Rotating invalidates the old one.</p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const hint = p.setupHint(baseUrl, p.id);
          return (
            <div key={p.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <p className="mb-2 text-sm font-medium">{p.label}</p>
              <div className="space-y-2">
                <CopyField label="base_url" value={hint.baseUrl} />
                <CopyField label="extra header" value={`x-motf-team: ${token}`} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{hint.note}</p>
            </div>
          );
        })}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-300">Example (OpenAI Python SDK)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-slate-200">{`from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/api/proxy/openai/v1",
    api_key="sk-...your own key...",
    default_headers={"x-motf-team": "${token}"},
)
client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hi"}],
)`}</pre>
      </details>

      <form action={setApiContentLogging} className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div>
          <p className="text-sm font-medium">Store full prompt & response content</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Off by default we log metadata only (provider, model, timing, sizes). Opt in to also store
            the full request/response so judges can review your actual prompts. Your choice, reversible.
          </p>
        </div>
        <input type="hidden" name="enabled" value={logContent ? "false" : "true"} />
        <button className={logContent ? "btn-primary shrink-0 text-xs" : "btn-ghost shrink-0 px-3 py-1.5 text-xs"}>
          {logContent ? "On — turn off" : "Opt in"}
        </button>
      </form>
    </section>
  );
}
