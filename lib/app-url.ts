import { headers } from "next/headers";

/**
 * Public origin baked into proxy setup instructions. `NEXT_PUBLIC_APP_URL` is
 * authoritative when set; otherwise inferred from the incoming request so
 * setup instructions still render correctly on a preview deploy that has no
 * env var configured for its own URL.
 */
export async function getAppUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
