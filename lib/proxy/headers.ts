import type { ProviderAdapter } from "@/lib/proxy/providers";

// Headers that describe THIS hop and must not ride through to upstream.
// `content-encoding`/`content-length` are handled separately by the caller
// because fetch has already decoded the response body by the time it's seen.
//
// `cookie` is stripped for a different reason than the rest: it is not
// hop-by-hop, it is OUR domain's session cookie. A browser-issued request to
// this route (deliberately outside the session middleware — see
// middleware.ts) would attach it, and forwarding it on would leak a
// participant's Supabase session cookie to a third-party AI provider on every
// call. No legitimate SDK call ever sends a Cookie header, so stripping it
// costs real usage nothing.
export const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "cookie",
]);

/** Headers to forward to upstream: caller's own headers, minus routing/hop-by-hop ones, plus adapter defaults. */
export function buildUpstreamHeaders(requestHeaders: Headers, adapter: ProviderAdapter): Headers {
  const headers = new Headers();
  requestHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!STRIP_REQUEST_HEADERS.has(lower) && lower !== "x-motf-team") headers.set(key, value);
  });
  if (adapter.defaultHeaders) {
    for (const [key, value] of Object.entries(adapter.defaultHeaders)) {
      if (!headers.has(key)) headers.set(key, value);
    }
  }
  return headers;
}

/** Headers to hand back to the caller: upstream's headers, minus ones that no longer describe the bytes or that must never cross this boundary. */
export function buildResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  // Defense in depth, symmetric with stripping the request Cookie header:
  // never let an upstream provider set a cookie under our own origin.
  headers.delete("set-cookie");
  return headers;
}
