import { randomBytes } from "crypto";
import { headers } from "next/headers";

// Per-team token that lives in the proxy base_url. Opaque, unguessable, prefixed
// so it's recognizable in logs. Not a secret on the level of an API key (it only
// grants the ability to route calls through us using the caller's OWN key), but
// unguessable enough that teams aren't logged against each other by accident.
export function genProxyToken(): string {
  return `motf_${randomBytes(18).toString("hex")}`;
}

// The public origin used to build copy-paste setup instructions. Prefer an
// explicit env (correct in prod behind a proxy/CDN); otherwise infer from the
// incoming request headers so localhost + previews just work.
export function publicBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
